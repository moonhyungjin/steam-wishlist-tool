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
