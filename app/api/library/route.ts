import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid");
  // GetOwnedGames just needs *a* valid key for Valve's own rate limiting - it doesn't have to
  // belong to the profile being looked up - so a visitor with no key of their own can still load
  // any public library by falling back to a server-side key from env (see /api/profile).
  const key = request.nextUrl.searchParams.get("key") || process.env.STEAM_API_KEY;
  if (!steamId) return NextResponse.json({ error: "steamid가 필요합니다." }, { status: 400 });
  if (!/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "Steam ID64는 17자리 숫자여야 합니다." }, { status: 400 });
  if (!key) return NextResponse.json({ error: "Steam API 키가 필요합니다." }, { status: 400 });

  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", key);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "false");
  url.searchParams.set("include_played_free_games", "true");
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "API 키가 올바르지 않습니다." }, { status: 401 });
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `Steam API 요청 실패 (${response.status})` },
        { status: 502 },
      );
    }
    const data = await response.json();
    const games = data.response?.games;
    if (!Array.isArray(games)) {
      return NextResponse.json({
        error: "게임 목록이 비어있습니다. 프로필의 '게임 세부정보'가 비공개일 수 있습니다.",
      });
    }
    const items = games
      .filter((g: any) => typeof g.appid === "number")
      .map((g: any) => ({
        appid: g.appid,
        playtimeMinutes: g.playtime_forever ?? 0,
        // Unix seconds of the last play session's end - Valve doesn't expose purchase/acquisition
        // date via any public API, but this comes back on every GetOwnedGames item for free, so it
        // stands in as the closest thing to a "recency" sort library data actually supports.
        lastPlayedTimestamp: g.rtime_last_played ? g.rtime_last_played * 1000 : null,
      }));
    return NextResponse.json({ count: items.length, items });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Steam API에 연결하지 못했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
