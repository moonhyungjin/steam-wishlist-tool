import { NextRequest, NextResponse } from "next/server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid");
  // Same fallback as /api/library and /api/profile - GetPlayerAchievements just needs *a* valid
  // key, not one belonging to the profile being looked up.
  const key = request.nextUrl.searchParams.get("key") || process.env.STEAM_API_KEY;
  const raw = request.nextUrl.searchParams.get("appids");
  if (!steamId || !key || !raw)
    return NextResponse.json({ error: "steamid, key, appids가 필요합니다." }, { status: 400 });
  if (!/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "Steam ID64는 17자리 숫자여야 합니다." }, { status: 400 });
  const appids = [
    ...new Set(
      raw
        .split(",")
        .map(Number)
        .filter((x) => Number.isInteger(x) && x > 0),
    ),
  ];
  if (!appids.length || appids.length > 40)
    return NextResponse.json({ error: "appids는 1~40개까지입니다." }, { status: 400 });

  const achievements: Record<string, { achieved: number; total: number; percent: number } | null> =
    {};
  let blocked = false;
  for (let i = 0; i < appids.length && !blocked; i += 5) {
    const batch = appids.slice(i, i + 5);
    await Promise.all(
      batch.map(async (appid) => {
        try {
          const url = new URL(
            "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/",
          );
          url.searchParams.set("appid", String(appid));
          url.searchParams.set("key", key);
          url.searchParams.set("steamid", steamId);
          url.searchParams.set("l", "koreana");
          const response = await fetch(url, { cache: "no-store" });
          if (response.status === 429 || response.status === 403) {
            blocked = true;
            return;
          }
          // Most non-ok responses here just mean "this game has no achievements/stats" -
          // that's the common case (most games have none), not an actual error.
          if (!response.ok) {
            achievements[String(appid)] = null;
            return;
          }
          const data = await response.json();
          const list = data.playerstats?.achievements;
          if (!data.playerstats?.success || !Array.isArray(list) || !list.length) {
            achievements[String(appid)] = null;
            return;
          }
          const achieved = list.filter((a: { achieved: number }) => a.achieved === 1).length;
          const total = list.length;
          achievements[String(appid)] = {
            achieved,
            total,
            percent: Math.round((achieved / total) * 100),
          };
        } catch {
          achievements[String(appid)] = null;
        }
      }),
    );
    if (i + 5 < appids.length && !blocked) await sleep(150);
  }
  return NextResponse.json({ achievements, blocked });
}
