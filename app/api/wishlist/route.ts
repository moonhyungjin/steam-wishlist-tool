import { NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid") || process.env.STEAM_ID;
  if (!steamId) return NextResponse.json({ error: "steamid가 필요합니다." }, { status: 400 });
  if (!/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "Steam ID64는 17자리 숫자여야 합니다." }, { status: 400 });
  const url = new URL("https://api.steampowered.com/IWishlistService/GetWishlist/v1/");
  url.searchParams.set("steamid", steamId);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    if (!response.ok)
      return NextResponse.json(
        { error: `Steam Wishlist 요청 실패 (${response.status})`, detail: text.slice(0, 500) },
        { status: 502 },
      );
    const data = JSON.parse(text);
    const items = (data.response?.items ?? [])
      .filter((x: any) => typeof x.appid === "number")
      .map((x: any) => ({ appid: x.appid, priority: x.priority ?? 0, added: x.added ?? 0 }));
    return NextResponse.json({ steamid: steamId, count: items.length, items });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Steam Wishlist API에 연결하지 못했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
