import { NextRequest, NextResponse } from "next/server";

// This is the old, per-game, unofficial appdetails endpoint - it's what used to rate-limit the
// whole app. It's only used here as a best-effort enrichment for Metacritic score (the only
// field IStoreBrowseService doesn't expose), never for core data. If it blocks us, we just stop
// early within *this* request and return whatever we have - no state is kept between requests,
// so the next load tries fresh instead of being stuck forever on one bad moment.
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
  if (!appids.length || appids.length > 20)
    return NextResponse.json({ error: "appids는 1~20개까지입니다." }, { status: 400 });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const scores: Record<string, number> = {};
  let blocked = false;
  for (let i = 0; i < appids.length && !blocked; i += 2) {
    const batch = appids.slice(i, i + 2);
    await Promise.all(
      batch.map(async (appid) => {
        try {
          const url = new URL("https://store.steampowered.com/api/appdetails");
          url.searchParams.set("appids", String(appid));
          url.searchParams.set("cc", "kr");
          url.searchParams.set("filters", "metacritic");
          const response = await fetch(url, {
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
          if (response.status === 429 || response.status === 403) {
            blocked = true;
            return;
          }
          if (!response.ok) return;
          const data = await response.json();
          const score = data[String(appid)]?.data?.metacritic?.score;
          if (typeof score === "number") scores[String(appid)] = score;
        } catch {}
      }),
    );
    if (i + 2 < appids.length && !blocked) await sleep(400);
  }
  return NextResponse.json({ scores, blocked });
}
