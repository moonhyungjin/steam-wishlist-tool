import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// In-memory stand-in for Upstash so the route's real claim/lock logic runs.
const store = new Map<string, unknown>();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(k: string) {
      return store.has(k) ? store.get(k) : null;
    }
    async set(k: string, v: unknown, opts?: { nx?: boolean }) {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    }
  },
}));
process.env.UPSTASH_REDIS_REST_URL = "http://fake";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake";

const { GET, POST } = await import("../app/api/sync/route");

const ID = "76561198000000000";
const A = "a".repeat(64);
const B = "b".repeat(64);
const post = (token: string | null, body: object = { statusMap: { 1: "playing" } }) =>
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
    expect((await post(A, { statusMap: { 1: "completed" } })).status).toBe(200);
    expect((await (await get(A)).json()).statusMap).toEqual({ 1: "completed" });
  });

  it("another token can't overwrite a claimed record, and the data is left untouched", async () => {
    await post(A, { statusMap: { 1: "completed" } });
    const res = await post(B, { statusMap: { 1: "dropped" } });
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
