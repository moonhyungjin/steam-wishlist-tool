import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// In-memory stand-in for Upstash so the route's real claim/lock and per-entry merge logic runs.
// Hashes live in the same map as Map<field, string>; hgetall JSON-parses values the way Upstash's
// automatic deserialization does.
const store = new Map<string, unknown>();
const hash = (k: string) => {
  if (!store.has(k)) store.set(k, new Map<string, string>());
  return store.get(k) as Map<string, string>;
};
const parse = (v: string) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
const commands = {
  async get(k: string) {
    return store.has(k) ? store.get(k) : null;
  },
  async set(k: string, v: unknown, opts?: { nx?: boolean }) {
    if (opts?.nx && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  },
  async exists(k: string) {
    return store.has(k) ? 1 : 0;
  },
  async expire() {
    return 1;
  },
  async hset(k: string, kv: Record<string, string>) {
    for (const [f, v] of Object.entries(kv)) hash(k).set(f, v);
    return Object.keys(kv).length;
  },
  async hdel(k: string, ...fields: string[]) {
    for (const f of fields) hash(k).delete(f);
    return 1;
  },
  async hgetall(k: string) {
    const h = store.get(k) as Map<string, string> | undefined;
    return h?.size ? Object.fromEntries([...h].map(([f, v]) => [f, parse(v)])) : null;
  },
};
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {
      Object.assign(this, commands);
    }
    multi() {
      const queued: (() => Promise<unknown>)[] = [];
      const tx = new Proxy(
        {},
        {
          get: (_, name: string) =>
            name === "exec"
              ? async () => {
                  const out = [];
                  for (const run of queued) out.push(await run());
                  return out;
                }
              : (...args: unknown[]) => {
                  queued.push(() =>
                    (commands as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
                      name
                    ](...args),
                  );
                  return tx;
                },
        },
      );
      return tx;
    }
  },
}));
process.env.UPSTASH_REDIS_REST_URL = "http://fake";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake";

const { GET, POST } = await import("../app/api/sync/route");

const ID = "76561198000000000";
const A = "a".repeat(64);
const B = "b".repeat(64);
const setStatus = (appid: number, value: string) => ({
  ops: [{ map: "statusMap", appid, op: "set", value }],
});
const post = (token: string | null, body: object = setStatus(1, "playing")) =>
  POST(
    new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-sync-token": token } : {}) },
      body: JSON.stringify({ steamId: ID, ...body }),
    }),
  );
const get = (token?: string) =>
  GET(
    new NextRequest(`http://localhost/api/sync?steamid=${ID}`, {
      headers: token ? { "x-sync-token": token } : {},
    }),
  );

beforeEach(() => store.clear());

describe("/api/sync write protection", () => {
  it("rejects a write with no (or a malformed) token", async () => {
    expect((await post(null)).status).toBe(401);
    expect((await post("short")).status).toBe(401);
    expect(store.size).toBe(0);
  });

  it("the first writer claims the record; its token keeps working", async () => {
    expect((await post(A)).status).toBe(200);
    expect((await post(A, setStatus(1, "completed"))).status).toBe(200);
    expect((await (await get(A)).json()).statusMap).toEqual({ 1: "completed" });
  });

  it("another token can't overwrite a claimed record, and the data is left untouched", async () => {
    await post(A, setStatus(1, "completed"));
    const res = await post(B, setStatus(1, "dropped"));
    expect(res.status).toBe(403);
    expect((await res.json()).locked).toBe(true);
    expect((await (await get(A)).json()).statusMap).toEqual({ 1: "completed" });
  });

  it("reports link state on GET: unclaimed, owner, stranger - and never leaks the hash", async () => {
    expect((await (await get(A)).json()).linked).toBeNull();
    await post(A);
    expect((await (await get(A)).json()).linked).toBe(true);
    const stranger = await (await get(B)).json();
    expect(stranger.linked).toBe(false);
    expect(stranger.statusMap).toEqual({ 1: "playing" }); // reads stay open
    expect(JSON.stringify(stranger)).not.toMatch(/hash|syncauth/i);
  });

  it("lets a new token take over a record untouched for 90+ days (lost-token recovery)", async () => {
    await post(A);
    const auth = store.get(`syncauth:${ID}`) as { hash: string; updatedAt: number };
    store.set(`syncauth:${ID}`, { ...auth, updatedAt: Date.now() - 91 * 24 * 60 * 60 * 1000 });
    expect((await post(B)).status).toBe(200);
    expect((await post(A)).status).toBe(403); // the old token is now the stranger
  });
});

describe("/api/sync per-entry ops", () => {
  const read = async () => (await get(A)).json();

  it("changes to different games from two writes both survive", async () => {
    await post(A, setStatus(1, "playing"));
    await post(A, { ops: [{ map: "ratingMap", appid: 2, op: "set", value: "like" }] });
    await post(A, setStatus(3, "dropped"));
    const d = await read();
    expect(d.statusMap).toEqual({ 1: "playing", 3: "dropped" });
    expect(d.ratingMap).toEqual({ 2: "like" });
  });

  it("deleting the last entry of a map really empties it", async () => {
    await post(A, setStatus(1, "playing"));
    await post(A, { ops: [{ map: "statusMap", appid: 1, op: "del" }] });
    expect((await read()).statusMap).toEqual({});
  });

  it("applies ops in order within one request", async () => {
    await post(A, {
      ops: [
        { map: "starMap", appid: 5, op: "set", value: 4 },
        { map: "starMap", appid: 5, op: "del" },
        { map: "starMap", appid: 6, op: "set", value: 3 },
        { map: "starMap", appid: 6, op: "set", value: 4.5 },
      ],
    });
    expect((await read()).starMap).toEqual({ 6: 4.5 });
  });

  it("keeps empty arrays and a null achievement exactly as sent", async () => {
    const game = { appid: -1, name: "Epic Game", genres: [], genreIds: [], headerImage: null };
    await post(A, {
      ops: [
        { map: "manualGames", appid: -1, op: "set", value: game },
        { map: "achievementMap", appid: 7, op: "set", value: null },
      ],
    });
    const d = await read();
    expect(d.manualGames).toEqual({ "-1": game });
    expect(d.achievementMap).toEqual({ 7: null });
  });

  it("reports whether a record exists", async () => {
    expect((await read()).exists).toBe(false);
    await post(A);
    expect((await read()).exists).toBe(true);
  });

  it("refuses an old whole-map body with 409 and leaves the record untouched and unclaimed", async () => {
    const res = await post(A, { statusMap: { 1: "playing" } });
    expect(res.status).toBe(409);
    expect(store.size).toBe(0);
  });

  it("refuses malformed ops as a whole", async () => {
    for (const ops of [
      [],
      [{ map: "nope", appid: 1, op: "set", value: "x" }],
      [{ map: "statusMap", appid: 1.5, op: "set", value: "playing" }],
      [{ map: "statusMap", appid: 1, op: "set", value: "winning" }],
      [{ map: "starMap", appid: 1, op: "set", value: 4.2 }],
      [
        { map: "statusMap", appid: 1, op: "set", value: "playing" },
        { map: "ratingMap", appid: 1, op: "set", value: null },
      ],
    ]) {
      expect((await post(A, { ops })).status).toBe(400);
    }
    expect(store.size).toBe(0);
  });

  it("seeds from the legacy whole-record JSON once, dropping tombstoned manual games", async () => {
    store.set(`sync:${ID}`, {
      statusMap: { 1: "completed", [-9]: "playing" },
      ratingMap: {},
      manualGames: { [-9]: { appid: -9, name: "Gone", genres: [] }, [-8]: { appid: -8, genres: [] } },
      manualPlatform: { [-9]: "epic", [-8]: "stove" },
      manualRemovedIds: [-9],
    });
    const d = await read();
    expect(d.exists).toBe(true);
    expect(d.statusMap).toEqual({ 1: "completed", "-9": "playing" });
    expect(Object.keys(d.manualGames)).toEqual(["-8"]);
    expect(d.manualPlatform).toEqual({ "-8": "stove" });
    expect(d.manualRemovedIds).toBeUndefined();
    // later writes go on top of the seeded data, and the legacy copy is never read again
    await post(A, setStatus(2, "playing"));
    store.set(`sync:${ID}`, { statusMap: { 99: "dropped" } });
    expect((await read()).statusMap).toEqual({ 1: "completed", "-9": "playing", 2: "playing" });
  });

  it("a locked write changes nothing", async () => {
    await post(A, setStatus(1, "playing"));
    expect((await post(B, { ops: [{ map: "statusMap", appid: 1, op: "del" }] })).status).toBe(403);
    expect((await read()).statusMap).toEqual({ 1: "playing" });
  });
});
