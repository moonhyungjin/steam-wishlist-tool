import { expect, test, type Page } from "@playwright/test";
import { loadLibrary, loadWishlist, mockApis, mockLibrary } from "./helpers";

// genreIds 19 = 액션, 122 = RPG (both in GENRE_ALLOWLIST_IDS); mockApis' fullGame() hardcodes 액션,
// so these tests override /api/games where they need different genres.
async function mockGenreGames(page: Page) {
  await page.route("**/api/games**", (r) => {
    const mk = (appid: number, name: string, genre: string, id: number) => ({
      appid,
      name,
      headerImage: null,
      genres: [genre],
      genreIds: [id],
      releaseDate: null,
      releaseTimestamp: null,
      comingSoon: false,
      releaseUnannounced: false,
      earlyAccess: false,
      isFree: false,
      price: "₩ 10,000",
      initialPrice: null,
      priceValue: 1000000,
      discountPercent: 0,
      discountEndDate: null,
      discountEndTimestamp: null,
      reviewPositive: 90,
      koreanSupported: true,
      adultContent: false,
      isDemo: false,
      isDlc: false,
    });
    return r.fulfill({
      json: {
        games: {
          1: mk(1, "Action One", "액션", 19),
          2: mk(2, "Action Two", "액션", 19),
          3: mk(3, "Rpg One", "RPG", 122),
        },
      },
    });
  });
}

const ids = [{ appid: 1 }, { appid: 2 }, { appid: 3 }];
const base = ids.map((i) => ({ ...i, name: `g${i.appid}`, priceValue: 1000000 }));

test("genre filter narrows to the picked genre", async ({ page }) => {
  await mockApis(page, base);
  await mockGenreGames(page);
  await loadWishlist(page);
  await expect(page.getByText("Rpg One").first()).toBeVisible();
  await page.getByLabel(/^액션 \(2\)/).check({ force: true });
  await expect(page.getByText("Rpg One")).toHaveCount(0);
  await expect(page.getByText("Action One").first()).toBeVisible();
  await expect(page.getByText("Action Two").first()).toBeVisible();
});

test.describe("library filters (status / rating / stars from synced data)", () => {
  async function setup(page: Page) {
    await mockApis(page, base);
    await mockGenreGames(page);
    await mockLibrary(page, [1, 2, 3], {
      statusMap: { 1: "completed", 2: "playing" },
      ratingMap: { 1: "like", 3: "dislike" },
      starMap: { 2: 5 },
    });
    await loadLibrary(page);
    await expect(page.getByText("Action One").first()).toBeVisible();
  }
  const open = (page: Page, title: string) =>
    page.locator(".fieldToggle", { hasText: title }).first().click();

  test("진행 상태 filter", async ({ page }) => {
    await setup(page);
    await open(page, "진행 상태");
    await page.getByLabel(/^완료 \(/).check({ force: true });
    await expect(page.getByText("Action One").first()).toBeVisible();
    await expect(page.getByText("Action Two")).toHaveCount(0);
    await expect(page.getByText("Rpg One")).toHaveCount(0);
  });

  test("추천 filter (single-select)", async ({ page }) => {
    await setup(page);
    await open(page, "추천");
    await page.getByLabel(/비추천 \(/).check({ force: true });
    await expect(page.getByText("Rpg One").first()).toBeVisible();
    await expect(page.getByText("Action One")).toHaveCount(0);
    await expect(page.getByText("Action Two")).toHaveCount(0);
  });

  test("별점 filter", async ({ page }) => {
    await setup(page);
    await open(page, "별점");
    // options are SVG stars, no text - the list is ordered 5 stars first
    await page
      .locator(".filterGroup", { hasText: "별점" })
      .locator(".sortCheck input")
      .first()
      .check({ force: true });
    await expect(page.getByText("Action Two").first()).toBeVisible();
    await expect(page.getByText("Action One")).toHaveCount(0);
    await expect(page.getByText("Rpg One")).toHaveCount(0);
  });
});

test("switching accounts drops the previous account's synced status/ratings", async ({ page }) => {
  const A = "76561198000000000";
  const B = "76561198000000001";
  await mockApis(page, base);
  await mockGenreGames(page);
  await mockLibrary(page, [1, 2, 3]);
  // per-account sync: A has data, B has none
  await page.route("**/api/sync**", (r) => {
    if (r.request().method() !== "GET") return r.fulfill({ json: {} });
    const id = new URL(r.request().url()).searchParams.get("steamid");
    return r.fulfill({
      json:
        id === A
          ? { configured: true, statusMap: { 1: "completed" }, ratingMap: { 1: "like" } }
          : { configured: true },
    });
  });
  await loadLibrary(page);
  await expect(page.getByText("Action One").first()).toBeVisible();
  // account A: one game has a status, the other two show "상태 없음"
  await expect(page.getByText("상태 없음")).toHaveCount(2);

  await page.getByRole("button", { name: "계정 변경" }).click();
  await page.getByPlaceholder("Steam ID64").fill(B);
  await page.getByRole("button", { name: "라이브러리 가져오기" }).click();
  await expect(page.getByText("Action One").first()).toBeVisible();
  // account A's "완료" badge must not leak onto account B's library
  await expect(page.getByText("상태 없음")).toHaveCount(3);
});
