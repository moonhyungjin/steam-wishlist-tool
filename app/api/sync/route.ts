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
  achievementMap?: Record<number, { achieved: number; total: number; percent: number } | null>;
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
  const { statusMap, ratingMap, achievementMap }: SyncData = body;
  await client.set(`sync:${steamId}`, { statusMap, ratingMap, achievementMap });
  return NextResponse.json({ ok: true });
}
