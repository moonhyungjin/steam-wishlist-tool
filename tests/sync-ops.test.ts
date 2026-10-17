import { describe, expect, it } from "vitest";
import {
  SyncQueue,
  applyOps,
  emptyMaps,
  missingEntriesAsOps,
  type SendResult,
  type SyncOp,
} from "../app/syncOps";

const set = (appid: number, value: unknown, map: SyncOp["map"] = "statusMap"): SyncOp => ({
  map,
  appid,
  op: "set",
  value,
});
const del = (appid: number, map: SyncOp["map"] = "statusMap"): SyncOp => ({ map, appid, op: "del" });

// A fake server: applies what it receives in arrival order. Each send waits until the test
// resolves it, so tests control exactly when (and with what result) a request "lands".
function fakeServer() {
  let maps = emptyMaps();
  const waiting: { ops: SyncOp[]; resolve: (r: SendResult) => void }[] = [];
  return {
    get maps() {
      return maps;
    },
    get inFlight() {
      return waiting.length;
    },
    send(ops: SyncOp[]) {
      return new Promise<SendResult>((resolve) => waiting.push({ ops, resolve }));
    },
    async land(result: SendResult = "ok") {
      const req = waiting.shift()!;
      if (result === "ok") maps = applyOps(maps, req.ops);
      req.resolve(result);
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}
const makeQueue = (server: ReturnType<typeof fakeServer>, onLocked = () => {}) => {
  const persisted: SyncOp[][] = [];
  const q = new SyncQueue((ops) => server.send(ops), (ops) => persisted.push([...ops]), onLocked);
  return { q, persisted };
};

describe("SyncQueue", () => {
  it("sends one request at a time, so quick changes to one entry land in order", async () => {
    const server = fakeServer();
    const { q } = makeQueue(server);
    q.enqueue([set(1, "playing")]);
    q.enqueue([set(1, "completed")]);
    q.enqueue([del(1)]);
    expect(server.inFlight).toBe(1);
    await server.land();
    await server.land();
    expect(server.maps.statusMap).toEqual({});
    expect(q.size).toBe(0);
  });

  it("keeps ops the server didn't confirm and sends them on the next flush", async () => {
    const server = fakeServer();
    const { q, persisted } = makeQueue(server);
    q.enqueue([set(1, "playing")]);
    await server.land("retry");
    expect(q.size).toBe(1);
    expect(persisted.at(-1)).toEqual([set(1, "playing")]);
    void q.flush();
    await server.land();
    expect(server.maps.statusMap).toEqual({ 1: "playing" });
    expect(persisted.at(-1)).toEqual([]);
  });

  it("drops everything and reports when the record is locked", async () => {
    const server = fakeServer();
    let locked = false;
    const { q } = makeQueue(server, () => (locked = true));
    q.enqueue([set(1, "playing")]);
    q.enqueue([set(2, "playing")]);
    await server.land("locked");
    expect(locked).toBe(true);
    expect(q.size).toBe(0);
    expect(server.inFlight).toBe(0);
  });

  it("replays ops confirmed after a pull's GET left, plus the unconfirmed ones", async () => {
    const server = fakeServer();
    const { q } = makeQueue(server);
    q.enqueue([set(1, "playing")]);
    await server.land();
    const mark = q.mark(); // GET goes out now; the server reads {1: playing}
    const snapshot = server.maps;
    q.enqueue([set(2, "dropped")]);
    await server.land(); // confirmed after the GET read the record
    q.enqueue([del(1)]); // still in flight when the GET answers
    const merged = applyOps(snapshot, q.opsSince(mark));
    expect(merged.statusMap).toEqual({ 2: "dropped" });
    await server.land();
    expect(server.maps.statusMap).toEqual(merged.statusMap);
  });

  it("a clear while a request is in flight doesn't eat ops queued after it", async () => {
    const server = fakeServer();
    const { q } = makeQueue(server);
    q.enqueue([set(1, "playing")]);
    q.clear();
    q.enqueue([set(2, "playing")]);
    await server.land();
    expect(q.size).toBe(1);
    await server.land();
    expect(q.size).toBe(0);
    expect(server.maps.statusMap).toEqual({ 1: "playing", 2: "playing" });
  });
});

describe("merging", () => {
  it("catch-up uploads only entries the server has no value for", () => {
    const local = emptyMaps();
    local.statusMap = { 1: "playing", 2: "completed" };
    local.achievementMap = { 9: null };
    const server = emptyMaps();
    server.statusMap = { 2: "dropped" };
    expect(missingEntriesAsOps(local, server)).toEqual([
      set(1, "playing"),
      set(9, null, "achievementMap"),
    ]);
  });

  it("applyOps leaves the input maps untouched", () => {
    const maps = emptyMaps();
    maps.starMap = { 1: 3 };
    const next = applyOps(maps, [del(1, "starMap"), set(2, 4, "starMap")]);
    expect(maps.starMap).toEqual({ 1: 3 });
    expect(next.starMap).toEqual({ 2: 4 });
  });
});
