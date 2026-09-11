import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// This is the old, per-game, unofficial appdetails endpoint - it's what used to rate-limit the
// whole app (IP-based, not key-based, so it's a server-wide risk regardless of visitor count).
// A Metacritic score never changes once assigned, and a confirmed "no score" is just as
// permanent, so this is cached in the same shared Redis instance /api/sync and /api/lowestprice
// use - no TTL at all, since there's no realistic staleness to guard against. Once any visitor
// has resolved a game, nobody ever needs to ask Steam's fragile endpoint about it again.
let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

type MetacriticCacheEntry = { score: number | null };
// Keeps the actual live-fetch volume against the fragile endpoint unchanged from before caching
// existed - only what feeds into it changes now (cache misses only, not every requested appid).
const FRESH_FETCH_CAP = 20;

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
  if (!appids.length || appids.length > 200)
    return NextResponse.json({ error: "appids는 1~200개까지입니다." }, { status: 400 });

  const client = getRedis();
  const scores: Record<number, number | null> = {};
  let toFetch = appids;

  if (client) {
    const cached = await client.mget<(MetacriticCacheEntry | null)[]>(
      ...appids.map((id) => `metacritic:${id}`),
    );
    toFetch = [];
    appids.forEach((id, i) => {
      const entry = cached[i];
      if (entry) scores[id] = entry.score;
      else toFetch.push(id);
    });
  }
  toFetch = toFetch.slice(0, FRESH_FETCH_CAP);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const freshEntries: Record<number, MetacriticCacheEntry> = {};
  let blocked = false;
  for (let i = 0; i < toFetch.length && !blocked; i += 2) {
    const batch = toFetch.slice(i, i + 2);
    await Promise.all(
      batch.map(async (appid) => {
        try {
          const url = new URL("https://store.steampowered.com/api/appdetails");
          url.searchParams.set("appids", String(appid));
          // No cc here on purpose - the score itself isn't region-specific, but this endpoint
          // has been observed to silently return `null` (no wrapper object at all, not even
          // success:false) for some titles when filters=metacritic is combined with cc=kr
          // specifically (e.g. Satisfactory/526870), while cc=us or omitting cc entirely both
          // return the score fine for the same app.
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
          freshEntries[appid] = { score: typeof score === "number" ? score : null };
        } catch {}
      }),
    );
    if (i + 2 < toFetch.length && !blocked) await sleep(400);
  }

  if (client && Object.keys(freshEntries).length) {
    await Promise.all(
      Object.entries(freshEntries).map(([id, entry]) => client.set(`metacritic:${id}`, entry)),
    );
  }
  for (const [id, entry] of Object.entries(freshEntries)) scores[Number(id)] = entry.score;

  return NextResponse.json({ scores, blocked });
}
