// Shared by /api/sync and useSyncedData: the synced data travels as per-entry operations ("set
// game 123's status to playing", "delete game 123's star") instead of whole maps. A whole-map
// write from a device that loaded a while ago used to wipe every change other devices had made
// since - with per-entry ops, two devices only ever overwrite each other on the very same entry,
// and a deletion is an explicit op instead of "the key is missing", so it reaches other devices.

export const SYNC_MAPS = [
  "statusMap",
  "ratingMap",
  "starMap",
  "achievementMap",
  "manualPlatform",
  "manualGames",
  "manualPlaytime",
] as const;
export type SyncMapName = (typeof SYNC_MAPS)[number];
export type SyncMaps = Record<SyncMapName, Record<number, unknown>>;

// "del" is its own op kind rather than "set to null" because null is a real value in
// achievementMap ("checked, this game has no achievements").
export type SyncOp =
  | { map: SyncMapName; appid: number; op: "set"; value: unknown }
  | { map: SyncMapName; appid: number; op: "del" };

// Big enough for one achievement chunk (ACHIEVEMENT_CHUNK = 100) plus a first-sync upload in a few
// requests; the client batches to MAX_OPS_PER_REQUEST.
export const MAX_OPS_PER_REQUEST = 200;
const MAX_MANUAL_GAME_BYTES = 20_000;

const STATUSES = new Set(["playing", "completed", "incomplete", "dropped", "excluded"]);
const RATINGS = new Set(["like", "dislike"]);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validValue(map: SyncMapName, v: unknown): boolean {
  switch (map) {
    case "statusMap":
      return typeof v === "string" && STATUSES.has(v);
    case "ratingMap":
      return typeof v === "string" && RATINGS.has(v);
    case "starMap":
      return isNum(v) && v >= 0.5 && v <= 5 && v * 2 === Math.round(v * 2);
    case "achievementMap":
      return (
        v === null ||
        (typeof v === "object" &&
          isNum((v as Record<string, unknown>).achieved) &&
          isNum((v as Record<string, unknown>).total) &&
          isNum((v as Record<string, unknown>).percent))
      );
    case "manualPlatform":
      return typeof v === "string" && v.length > 0 && v.length <= 32;
    case "manualGames":
      return (
        !!v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        JSON.stringify(v).length <= MAX_MANUAL_GAME_BYTES
      );
    case "manualPlaytime":
      return isNum(v) && v >= 0;
  }
}

// One op in canonical form, or null if it's malformed.
export function parseOp(o: unknown): SyncOp | null {
  if (!o || typeof o !== "object") return null;
  const { map, appid, op, value } = o as Record<string, unknown>;
  if (!SYNC_MAPS.includes(map as SyncMapName)) return null;
  // Manually-added non-Steam games use negative ids (see ManualAddPanel).
  if (!Number.isSafeInteger(appid) || appid === 0) return null;
  if (op === "del") return { map: map as SyncMapName, appid: appid as number, op };
  if (op === "set" && validValue(map as SyncMapName, value))
    return { map: map as SyncMapName, appid: appid as number, op, value };
  return null;
}

// The well-formed ops of a request, plus how many were dropped. Malformed entries are skipped one
// by one rather than refusing the request: a client answers a refusal by dropping the whole batch
// (resending it would only be refused again), so one bad entry - say a status value an older
// version allowed and this one doesn't - would otherwise take up to MAX_OPS_PER_REQUEST good
// changes down with it. null only when the body isn't a usable op list at all.
export function parseOps(raw: unknown): { ops: SyncOp[]; dropped: number } | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPS_PER_REQUEST) return null;
  const ops = raw.map(parseOp).filter((o): o is SyncOp => o != null);
  return { ops, dropped: raw.length - ops.length };
}

export const emptyMaps = (): SyncMaps =>
  Object.fromEntries(SYNC_MAPS.map((m) => [m, {}])) as SyncMaps;

// Applies ops in order on top of maps, copying only the maps it touches.
export function applyOps(maps: SyncMaps, ops: SyncOp[]): SyncMaps {
  const next = { ...maps };
  const copied = new Set<SyncMapName>();
  for (const o of ops) {
    if (!copied.has(o.map)) {
      next[o.map] = { ...next[o.map] };
      copied.add(o.map);
    }
    if (o.op === "set") next[o.map][o.appid] = o.value;
    else delete next[o.map][o.appid];
  }
  return next;
}

// Every entry of `local` as a set op - the first upload into a record that doesn't exist yet.
export function allEntriesAsOps(local: SyncMaps): SyncOp[] {
  return SYNC_MAPS.flatMap((map) =>
    Object.entries(local[map]).map(([id, value]) => ({
      map,
      appid: Number(id),
      op: "set" as const,
      value,
    })),
  );
}

// Entries this device has that the server has no value for at all - the one-time catch-up after
// the switch to per-entry sync, for changes the old whole-map writes lost on the way. The server's
// value wins wherever both have one.
export function missingEntriesAsOps(local: SyncMaps, server: SyncMaps): SyncOp[] {
  return allEntriesAsOps(local).filter((o) => !(o.appid in server[o.map]));
}

export type SendResult = "ok" | "locked" | "retry";

// The device's outgoing ops, sent one request at a time in the order they were made, so two
// quick changes to the same entry can't reach the server out of order. An op leaves the queue
// only once the server has confirmed it. A pull replays opsSince(mark) on top of what the server
// returned: everything still unconfirmed, plus anything confirmed after the pull's GET left - the
// server may have read the record before that op landed.
export class SyncQueue {
  private pending: SyncOp[];
  private acked: { seq: number; op: SyncOp }[] = [];
  private seq = 0;
  private inFlight = false;
  private generation = 0;

  constructor(
    private send: (ops: SyncOp[]) => Promise<SendResult>,
    private persist: (ops: SyncOp[]) => void,
    private onLocked: () => void,
    initial: SyncOp[] = [],
  ) {
    this.pending = [...initial];
  }

  get size() {
    return this.pending.length;
  }

  enqueue(ops: SyncOp[]) {
    if (!ops.length) return;
    this.pending.push(...ops);
    this.persist(this.pending);
    void this.flush();
  }

  async flush() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      while (this.pending.length) {
        const gen = this.generation;
        const batch = this.pending.slice(0, MAX_OPS_PER_REQUEST);
        const result = await this.send(batch).catch((): SendResult => "retry");
        if (gen !== this.generation) continue; // cleared while in flight - nothing to remove
        if (result === "retry") break;
        if (result === "locked") {
          this.clear();
          this.onLocked();
          break;
        }
        this.pending.splice(0, batch.length);
        for (const op of batch) this.acked.push({ seq: ++this.seq, op });
        if (this.acked.length > 2000) this.acked.splice(0, this.acked.length - 2000);
        this.persist(this.pending);
      }
    } finally {
      this.inFlight = false;
    }
  }

  // Call right before a pull's GET goes out.
  mark(): number {
    return this.seq;
  }

  opsSince(mark: number): SyncOp[] {
    return [...this.acked.filter((a) => a.seq > mark).map((a) => a.op), ...this.pending];
  }

  clear() {
    this.generation++;
    this.pending = [];
    this.persist(this.pending);
  }
}
