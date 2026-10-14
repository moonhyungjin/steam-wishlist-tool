import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
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

// Write protection without accounts: the first browser to save a record claims it with a random
// secret token (only its SHA-256 is stored, under its own key so the data shape is untouched);
// later writes must present the same token. Reads stay open - the synced data is play status and
// ratings, nothing sensitive - but GET tells a caller whether it holds the claim. Another device
// links by entering the first device's code. A record nobody has written to for this long can be
// re-claimed, so a lost token (cleared browser data) never locks someone out forever.
const TOKEN_RE = /^[0-9a-f]{64}$/;
const STALE_TAKEOVER_MS = 90 * 24 * 60 * 60 * 1000;
type SyncAuth = { hash: string; updatedAt: number };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const authKey = (steamId: string) => `syncauth:${steamId}`;

export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid");
  if (!steamId || !/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "steamid가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ configured: false });
  const data = await client.get<SyncData>(`sync:${steamId}`);
  // linked: true = this caller's token owns the record, false = someone else's does, null = not
  // claimed yet (the first write will claim it).
  const token = request.headers.get("x-sync-token") ?? "";
  const auth = await client.get<SyncAuth>(authKey(steamId));
  const linked = !auth ? null : TOKEN_RE.test(token) && auth.hash === hashToken(token);
  return NextResponse.json({ configured: true, linked, ...(data ?? {}) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const steamId = body?.steamId;
  if (!steamId || !/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "steamId가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ configured: false });
  const token = request.headers.get("x-sync-token") ?? "";
  if (!TOKEN_RE.test(token))
    return NextResponse.json({ error: "동기화 토큰이 필요합니다." }, { status: 401 });
  const hash = hashToken(token);
  const now = Date.now();
  let auth = await client.get<SyncAuth>(authKey(steamId));
  if (!auth) {
    // nx: if two first writes race, only one claims; the loser falls through to the check below.
    const claimed = await client.set(authKey(steamId), { hash, updatedAt: now }, { nx: true });
    if (!claimed) auth = await client.get<SyncAuth>(authKey(steamId));
  }
  if (auth && auth.hash !== hash && now - auth.updatedAt < STALE_TAKEOVER_MS)
    return NextResponse.json(
      { error: "다른 기기가 이 기록을 사용 중이에요.", locked: true },
      { status: 403 },
    );
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
  await client.set(authKey(steamId), { hash, updatedAt: now });
  return NextResponse.json({ ok: true, linked: true });
}
