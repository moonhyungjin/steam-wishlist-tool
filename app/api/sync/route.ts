import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// Cross-device sync for the data that can't be re-fetched from Steam - play status, like/dislike,
// and achievement %. Wishlist/library game lists stay localStorage-only since they're just a
// re-fetchable mirror of Steam's own data. Not configuring the env vars is a valid state (personal
// single-device use) - both handlers report that back instead of erroring, so the app keeps working
// on localStorage alone.
let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

type SyncData = {
  statusMap?: Record<number, string>;
  ratingMap?: Record<number, string>;
  starMap?: Record<number, number>;
  achievementMap?: Record<number, { achieved: number; total: number; percent: number } | null>;
  // Manually-added games (Epic/STOVE/기타) have no Steam-side record to re-fetch, unlike the
  // wishlist/library item lists - so unlike those, this trio has to be synced verbatim.
  manualPlatform?: Record<number, string>;
  manualGames?: Record<number, unknown>;
  manualPlaytime?: Record<number, number>;
  // Appids deleted on some device - see the client-side comment on MANUAL_REMOVED_STORAGE_KEY.
  // Plain full-replace like everything else here - the client is responsible for unioning this
  // with whatever it last pulled before pushing again (see syncFromServer), so a device that
  // hasn't pulled a deletion made elsewhere yet doesn't overwrite it with a shorter list.
  manualRemovedIds?: number[];
};

export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid");
  if (!steamId || !/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "steamid가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ configured: false });
  const data = await client.get<SyncData>(`sync:${steamId}`);
  return NextResponse.json({ configured: true, ...(data ?? {}) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const steamId = body?.steamId;
  if (!steamId || !/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "steamId가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ configured: false });
  const {
    statusMap,
    ratingMap,
    starMap,
    achievementMap,
    manualPlatform,
    manualGames,
    manualPlaytime,
    manualRemovedIds,
  }: SyncData = body;
  await client.set(`sync:${steamId}`, {
    statusMap,
    ratingMap,
    starMap,
    achievementMap,
    manualPlatform,
    manualGames,
    manualPlaytime,
    manualRemovedIds,
  });
  return NextResponse.json({ ok: true });
}
