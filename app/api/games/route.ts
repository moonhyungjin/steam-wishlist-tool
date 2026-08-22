import { NextRequest, NextResponse } from "next/server";

let tagMapCache: Record<number, string> | null = null;
async function getTagMap(): Promise<Record<number, string>> {
  if (tagMapCache) return tagMapCache;
  try {
    const r = await fetch(
      "https://api.steampowered.com/IStoreService/GetTagList/v1/?language=koreana",
      {
        cache: "no-store",
      },
    );
    const data = await r.json();
    const map: Record<number, string> = {};
    for (const t of data.response?.tags ?? []) map[t.tagid] = t.name;
    if (Object.keys(map).length) tagMapCache = map;
    return map;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("appids");
  if (!raw) return NextResponse.json({ error: "appids가 필요합니다." }, { status: 400 });
  const appids = [
    ...new Set(
      raw
        .split(",")
        .map(Number)
        .filter((x) => Number.isInteger(x) && x > 0),
    ),
  ];
  // A GET request with ~250 ids in the input_json query string starts hitting URL-length limits
  // on this endpoint; 200 leaves comfortable margin.
  if (!appids.length || appids.length > 200)
    return NextResponse.json({ error: "appids는 1~200개까지입니다." }, { status: 400 });

  const tagMap = await getTagMap();
  const inputJson = JSON.stringify({
    ids: appids.map((appid) => ({ appid })),
    context: { language: "koreana", country_code: "KR" },
    data_request: {
      include_release: true,
      include_assets: true,
      include_pricing: true,
      include_reviews: true,
      // Requesting more tags than we'll ever show per-game (still only 3 shown in the row text)
      // gives the sidebar genre filter a real shot at surfacing an actual genre even when a
      // game's top few community tags are all flavor/aesthetic ones instead.
      include_tag_count: 15,
      include_supported_languages: true,
    },
  });
  const url = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(inputJson)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return NextResponse.json({ games: {} });
  const data = await response.json();

  const result: Record<string, unknown> = {};
  for (const item of data.response?.store_items ?? []) {
    if (!item?.success) continue;
    const appid = item.appid;
    const opt = item.best_purchase_option;
    const releaseTimestamp = item.release?.steam_release_date
      ? item.release.steam_release_date * 1000
      : null;
    // "coming soon" has to come from Steam's own flag, not just "no timestamp yet" - games with
    // an estimated future date (coming_soon_display: date_year/date_quarter/date_full) still get
    // a steam_release_date, but they haven't released either. "text_tba" specifically means no
    // date has been announced at all yet (vs. "text_comingsoon", which has none but is confirmed).
    const comingSoon: boolean = !!item.release?.is_coming_soon;
    const releaseUnannounced = item.release?.coming_soon_display === "text_tba";
    const earlyAccess: boolean = !!item.is_early_access;
    const headerFile = item.assets?.header;
    const headerImage =
      item.assets?.asset_url_format && headerFile
        ? "https://shared.akamai.steamstatic.com/store_item_assets/" +
          item.assets.asset_url_format.replace("${FILENAME}", headerFile)
        : null;
    const genres = (item.tagids ?? [])
      .map((id: number) => tagMap[id])
      .filter(Boolean)
      .slice(0, 15);
    const finalPrice = opt ? Number(opt.final_price_in_cents) : null;
    // elanguage 4 is Korean in Valve's language enum (verified empirically: Cyberpunk 2077,
    // which has an official Korean dub, reports elanguage 4 with full_audio true).
    // supported_languages only lists languages Steam actually supports (unsupported ones are
    // simply absent, not present with supported:false) - so just finding the entry is enough;
    // interface-only support (no dub, no subtitles) still counts as "Korean supported".
    const koreanSupported = (item.supported_languages ?? []).some((l: any) => l.elanguage === 4);
    // Valve's content descriptor ids (Steamworks docs): 1/3/4 are nudity-or-sexual-content
    // variants, 2 is violence/gore, 5 is "general mature content" (drugs, language, etc.) - only
    // 1/3/4 are what "선정적 콘텐츠" (sexual content) means here.
    const adultContent = (item.content_descriptorids ?? []).some((id: number) =>
      [1, 3, 4].includes(id),
    );
    // type 1 is Steam's "Demo" item type (verified against the user's own library: every entry
    // named "... Demo" came back as type 1).
    const isDemo = item.type === 1;
    result[String(appid)] = {
      appid,
      name: item.name ?? `Steam App ${appid}`,
      headerImage,
      genres,
      releaseDate: releaseTimestamp
        ? new Date(releaseTimestamp).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })
        : null,
      releaseTimestamp,
      comingSoon,
      releaseUnannounced,
      earlyAccess,
      isFree: finalPrice === 0,
      price: opt
        ? finalPrice === 0
          ? "무료 플레이"
          : opt.formatted_final_price
        : "가격 정보 없음",
      initialPrice: opt?.formatted_original_price ?? null,
      priceValue: finalPrice,
      discountPercent: opt?.discount_pct ?? 0,
      reviewPositive: item.reviews?.summary_filtered?.percent_positive ?? null,
      metacritic: null,
      koreanSupported,
      adultContent,
      isDemo,
    };
  }
  return NextResponse.json({ games: result });
}
