import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid");
  // GetPlayerSummaries just needs *a* valid key for Valve's own rate limiting - it doesn't have to
  // belong to the profile being looked up - so the wishlist tab (which never collects a key from
  // the user) can still show a profile card by falling back to a server-side key from env.
  const key = request.nextUrl.searchParams.get("key") || process.env.STEAM_API_KEY;
  if (!steamId || !key)
    return NextResponse.json({ error: "steamid, key가 필요합니다." }, { status: 400 });
  if (!/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "Steam ID64는 17자리 숫자여야 합니다." }, { status: 400 });

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("key", key);
  url.searchParams.set("steamids", steamId);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    return NextResponse.json({ error: "프로필을 가져오지 못했습니다." }, { status: 502 });
  const data = await response.json();
  const player = data.response?.players?.[0];
  if (!player) return NextResponse.json({ profile: null });

  return NextResponse.json({
    profile: {
      personaName: player.personaname ?? null,
      avatarUrl: player.avatarfull ?? player.avatarmedium ?? player.avatar ?? null,
      profileUrl: player.profileurl ?? null,
    },
  });
}
