import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  SYNC_MAPS,
  emptyMaps,
  parseOp,
  parseOps,
  type SyncMapName,
  type SyncMaps,
} from "../../syncOps";

// Cross-device sync for the data that can't be re-fetched from Steam - play status, like/dislike,
// stars, achievement % and manually-added games. Wishlist/library game lists stay localStorage-only
// since they're just a re-fetchable mirror of Steam's own data. Not configuring the env vars is a
// valid state (personal single-device use) - both handlers report that back instead of erroring,
// so the app keeps working on localStorage alone.
let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

// Storage: one Redis hash per map (field = appid, value = the entry as JSON text), written with
// per-entry HSET/HDEL - see app/syncOps.ts for why writes are ops instead of whole maps. Values are
// opaque JSON strings on purpose, so nothing on the server re-encodes them (an empty array stays
// an array). `sync2:{id}` marks that the record exists.
const metaKey = (steamId: string) => `sync2:${steamId}`;
const mapKey = (steamId: string, map: SyncMapName) => `sync2:${steamId}:${map}`;
// The whole-record JSON this route stored before per-entry ops. Read once, on the record's first
// access, to seed the hashes, then left to expire.
const legacyKey = (steamId: string) => `sync:${steamId}`;
type LegacyData = Partial<Record<SyncMapName, Record<string, unknown>>> & {
  manualRemovedIds?: number[];
};
const LEGACY_TTL_SECONDS = 90 * 24 * 60 * 60;

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

// Seeds the hashes and sets the marker in one atomic step, or does nothing if the marker already
// exists. Values arrive already JSON-encoded from JS and are written as-is - no cjson round-trip,
// which drops null fields on Upstash. ARGV: marker value, then (hash key, field, value) triples.
const SEED_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
for i = 2, #ARGV, 3 do redis.call('HSET', ARGV[i], ARGV[i + 1], ARGV[i + 2]) end
redis.call('SET', KEYS[1], ARGV[1])
return 1
`;

// Returns whether the record exists, creating it (create=true) or seeding it from the legacy
// record. Seeding and the marker go in one script, so no op from another request can land between
// them (and be overwritten by a slower seeder), and a seed that fails leaves no marker behind -
// the next access simply tries again.
async function ensureRecord(client: Redis, steamId: string, create: boolean): Promise<boolean> {
  if (await client.exists(metaKey(steamId))) return true;
  const legacy = await client.get<LegacyData>(legacyKey(steamId));
  if (!legacy && !create) return false;
  const args = [JSON.stringify({ createdAt: Date.now() })];
  if (legacy) {
    // The legacy record's tombstones hid deleted manual games that a stale whole-map write had put
    // back - drop those entries for good instead of carrying the tombstone list forward. Entries
    // the current format wouldn't accept (e.g. a status value since retired) are left behind too.
    const removed = new Set((legacy.manualRemovedIds ?? []).map(String));
    for (const map of SYNC_MAPS)
      for (const [id, value] of Object.entries(legacy[map] ?? {})) {
        if (map.startsWith("manual") && removed.has(id)) continue;
        if (!parseOp({ map, appid: Number(id), op: "set", value })) continue;
        args.push(mapKey(steamId, map), id, JSON.stringify(value));
      }
  }
  await client.eval(SEED_SCRIPT, [metaKey(steamId)], args);
  if (legacy) await client.expire(legacyKey(steamId), LEGACY_TTL_SECONDS);
  return true;
}

// Upstash JSON-parses hash values on read by default; parse here too in case that's turned off.
function decode(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

async function readMaps(client: Redis, steamId: string): Promise<SyncMaps> {
  const tx = client.multi();
  for (const map of SYNC_MAPS) tx.hgetall(mapKey(steamId, map));
  const rows = (await tx.exec()) as (Record<string, unknown> | null)[];
  const maps = emptyMaps();
  SYNC_MAPS.forEach((map, i) => {
    for (const [id, v] of Object.entries(rows[i] ?? {})) maps[map][Number(id)] = decode(v);
  });
  return maps;
}

export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid");
  if (!steamId || !/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "steamid가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ configured: false });
  const exists = await ensureRecord(client, steamId, false);
  const maps = exists ? await readMaps(client, steamId) : emptyMaps();
  // linked: true = this caller's token owns the record, false = someone else's does, null = not
  // claimed yet (the first write will claim it).
  const token = request.headers.get("x-sync-token") ?? "";
  const auth = await client.get<SyncAuth>(authKey(steamId));
  const linked = !auth ? null : TOKEN_RE.test(token) && auth.hash === hashToken(token);
  return NextResponse.json({ configured: true, linked, exists, ...maps });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const steamId = body?.steamId;
  if (!steamId || !/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "steamId가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ configured: false });
  const token = request.headers.get("x-sync-token") ?? "";
  if (!TOKEN_RE.test(token))
    return NextResponse.json({ error: "동기화 토큰이 필요합니다." }, { status: 401 });
  // A tab still running the code from before per-entry ops sends its whole (possibly stale) maps.
  // Applying that - even as add-only - would bring back entries deleted elsewhere, so it's refused;
  // that tab picks up the new code on its next reload. Checked before the claim below, so a
  // refused request never claims a record either.
  if (!("ops" in body))
    return NextResponse.json(
      { error: "페이지를 새로고침해 주세요.", outdated: true },
      { status: 409 },
    );
  const parsed = parseOps(body.ops);
  if (!parsed) return NextResponse.json({ error: "잘못된 동기화 요청이에요." }, { status: 400 });
  const { ops, dropped } = parsed;
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
  await ensureRecord(client, steamId, true);
  // One transaction, ops in request order - a set followed by a delete of the same entry in one
  // batch ends deleted.
  const tx = client.multi();
  for (const o of ops) {
    if (o.op === "set")
      tx.hset(mapKey(steamId, o.map), { [String(o.appid)]: JSON.stringify(o.value) });
    else tx.hdel(mapKey(steamId, o.map), String(o.appid));
  }
  tx.set(authKey(steamId), { hash, updatedAt: now });
  await tx.exec();
  return NextResponse.json({ ok: true, linked: true, dropped });
}
