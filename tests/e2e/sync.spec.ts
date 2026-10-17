import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { STEAM_ID, fullGame, loadLibrary, mockApis, mockLibrary } from "./helpers";
import { applyOps, emptyMaps, type SyncMaps, type SyncOp } from "../../app/syncOps";

// Two devices (separate browser contexts = separate localStorage) against one in-test stand-in
// for /api/sync that applies ops the way the real route does. Before per-entry sync, the device
// that loaded first wiped the other's change on its next edit.
const games = [
  { appid: 1, name: "Alpha Game", priceValue: 1000000 },
  { appid: 2, name: "Bravo Game", priceValue: 1000000 },
  { appid: 3, name: "Charlie Game", priceValue: 1000000 },
];

async function device(context: BrowserContext, server: { maps: SyncMaps }) {
  const page = await context.newPage();
  await mockApis(page, games);
  await mockLibrary(page, [1, 2, 3]);
  await page.route("**/api/sync**", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { configured: true, linked: true, exists: true, ...server.maps } });
    const ops = (r.request().postDataJSON() as { ops: SyncOp[] }).ops;
    server.maps = applyOps(server.maps, ops);
    return r.fulfill({ json: { ok: true, linked: true } });
  });
  return page;
}

const row = (page: Page, name: string) => page.locator("article", { hasText: name });
async function pickStatus(page: Page, name: string, label: string) {
  await row(page, name).getByTitle("진행 상태").click();
  await row(page, name).locator(".statusOption", { hasText: label }).click();
}

test("two devices editing different games both keep their change, and a delete reaches the other", async ({
  browser,
}) => {
  const server = { maps: emptyMaps() };
  server.maps.statusMap = { 3: "completed" };
  const a = await device(await browser.newContext(), server);
  const b = await device(await browser.newContext(), server);
  for (const p of [a, b]) {
    await loadLibrary(p);
    await expect(row(p, "Charlie Game").getByTitle("진행 상태")).toHaveText(/완료/);
  }

  await pickStatus(a, "Alpha Game", "플레이중");
  await expect.poll(() => server.maps.statusMap[1]).toBe("playing");
  // b still shows its stale copy (no status on Alpha) when it makes its own change
  await pickStatus(b, "Bravo Game", "하차");
  await expect.poll(() => server.maps.statusMap[2]).toBe("dropped");
  expect(server.maps.statusMap).toEqual({ 1: "playing", 2: "dropped", 3: "completed" });

  // clearing a status on a is a real delete, not "missing, so keep b's copy"
  await pickStatus(a, "Charlie Game", "완료");
  await expect.poll(() => 3 in server.maps.statusMap).toBe(false);
  await pickStatus(b, "Bravo Game", "보류");
  await expect.poll(() => server.maps.statusMap[2]).toBe("incomplete");
  expect(server.maps.statusMap).toEqual({ 1: "playing", 2: "incomplete" });

  // reopening b: the remembered account restores from cache and pulls on mount
  await b.reload();
  await b.getByRole("button", { name: "라이브러리", exact: true }).click();
  await expect(row(b, "Alpha Game").getByTitle("진행 상태")).toHaveText(/플레이중/);
  await expect(row(b, "Charlie Game").getByTitle("진행 상태")).toHaveText(/상태 없음/);
  expect(await b.evaluate((id) => localStorage.getItem(`syncQueue:${id}`), STEAM_ID)).toBeNull();
});

// Seeds a device's localStorage as if it had been used under the old whole-map sync.
async function seedLocal(page: Page, entries: Record<string, unknown>) {
  await page.goto("/");
  await page.evaluate((e) => {
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, JSON.stringify(v));
  }, entries);
}

test("first pull after the switch uploads only what the server lacks, once, minus tombstoned games", async ({
  browser,
}) => {
  const server = { maps: emptyMaps() };
  server.maps.statusMap = { 3: "completed" };
  const page = await device(await browser.newContext(), server);
  const gone = fullGame({ appid: -5, name: "Deleted Epic Game", priceValue: null });
  await seedLocal(page, {
    "library:status": { 1: "playing", 3: "dropped" },
    "library:manualGames": { [-5]: gone },
    "library:manual": { [-5]: "epic" },
    "library:manualRemoved": [-5],
  });
  await loadLibrary(page);
  await expect.poll(() => server.maps.statusMap[1]).toBe("playing");
  expect(server.maps.statusMap).toEqual({ 1: "playing", 3: "completed" }); // server wins on 3
  expect(server.maps.manualGames).toEqual({});
  await expect(row(page, "Charlie Game").getByTitle("진행 상태")).toHaveText(/완료/);
  expect(await page.evaluate(() => localStorage.getItem("library:manualRemoved"))).toBeNull();

  // another device clears Alpha's status; this device must not upload its copy again
  server.maps = applyOps(server.maps, [{ map: "statusMap", appid: 1, op: "del" }]);
  await page.reload();
  await page.getByRole("button", { name: "라이브러리", exact: true }).click();
  await expect(row(page, "Alpha Game").getByTitle("진행 상태")).toHaveText(/상태 없음/);
  expect(server.maps.statusMap).toEqual({ 3: "completed" });
});

test("removing a manual game deletes it (and its star) on the server", async ({ browser }) => {
  const epic = fullGame({ appid: -7, name: "Epic Only Game", priceValue: null });
  const server = { maps: emptyMaps() };
  server.maps.manualGames = { [-7]: epic };
  server.maps.manualPlatform = { [-7]: "epic" };
  server.maps.starMap = { [-7]: 4, 1: 3 };
  const page = await device(await browser.newContext(), server);
  await seedLocal(page, { [`syncMerged:${STEAM_ID}`]: 1 });
  await loadLibrary(page);
  await row(page, "Epic Only Game").getByTitle("목록에서 제거").click();
  await expect(row(page, "Epic Only Game")).toHaveCount(0);
  await expect.poll(() => server.maps.manualGames).toEqual({});
  expect(server.maps.manualPlatform).toEqual({});
  expect(server.maps.starMap).toEqual({ 1: 3 });
});
