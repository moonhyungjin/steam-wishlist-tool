import { expect, test } from "@playwright/test";
import { loadWishlist, mockApis } from "./helpers";

test("lowest-price markers show only on discounted games", async ({ page }) => {
  await mockApis(
    page,
    [
      // on sale, current price 10,000 vs recorded low 5,000 -> not at the low
      { appid: 1, name: "Sale Not Low", priceValue: 1000000, discountPercent: 50 },
      // on sale at exactly the recorded low
      { appid: 2, name: "Sale At Low", priceValue: 500000, discountPercent: 75 },
      // full price - must never carry a marker
      { appid: 3, name: "Full Price", priceValue: 2000000 },
    ],
    { 1: 5000, 2: 5000, 3: 1000 },
  );
  await loadWishlist(page);

  await expect(page.getByText("Sale Not Low").first()).toBeVisible();
  await expect(page.locator(".chip.notLowestPrice")).toHaveCount(1);
  await expect(page.locator(".chip.lowestPriceChip")).toHaveCount(1);
  await expect(page.locator(".chip.noPriceData")).toHaveCount(0);
  // the full-price game's chip is a plain price chip
  await expect(page.locator(".chip", { hasText: "20,000" }).first()).not.toHaveClass(
    /lowestPriceChip|notLowestPrice|noPriceData/,
  );
});

test("a game whose sale ended drops its marker after a refresh (stale-low regression)", async ({
  page,
}) => {
  let saleOver = false;
  await mockApis(
    page,
    () => [
      saleOver
        ? { appid: 7, name: "Ended Sale", priceValue: 2000000 }
        : { appid: 7, name: "Ended Sale", priceValue: 1000000, discountPercent: 50 },
    ],
    { 7: 5000 },
  );
  await loadWishlist(page);
  await expect(page.locator(".chip.notLowestPrice")).toHaveCount(1);

  saleOver = true;
  await page.getByRole("button", { name: "찜목록 새로고침" }).click();
  await expect(page.locator(".chip", { hasText: "20,000" })).toBeVisible();
  await expect(
    page.locator(".chip.notLowestPrice, .chip.lowestPriceChip, .chip.noPriceData"),
  ).toHaveCount(0);
});

test("a 900-game wishlist stays virtualized and loads quickly", async ({ page }) => {
  const games = Array.from({ length: 900 }, (_, i) => ({
    appid: 1000 + i,
    name: `Game ${i}`,
    priceValue: 1000000,
    discountPercent: i % 3 === 0 ? 30 : 0,
  }));
  await mockApis(page, games);
  const t0 = Date.now();
  await loadWishlist(page);
  await expect(page.getByText("Game 0").first()).toBeVisible();
  const ms = Date.now() - t0;
  console.log(`900 games: first row visible after ${ms}ms`);
  const rendered = await page.getByText(/^Game \d+$/).count();
  expect(rendered).toBeLessThan(60);
  expect(ms).toBeLessThan(5000);
});

const FILTER_GAMES = [
  { appid: 1, name: "Alpha Sale", priceValue: 1000000, discountPercent: 50 },
  { appid: 2, name: "Bravo Low", priceValue: 500000, discountPercent: 75 },
  { appid: 3, name: "Charlie Full", priceValue: 2000000 },
  { appid: 4, name: "Delta Sale", priceValue: 800000, discountPercent: 20 },
];
// Alpha: sale but not at its low; Bravo: sale at its low; Delta: sale, no ITAD data (not returned)
const FILTER_LOWS = { 1: 5000, 2: 5000 };

const visibleNames = (page: import("@playwright/test").Page) =>
  page
    .getByText(/^(Alpha|Bravo|Charlie|Delta) /)
    .evaluateAll((els) => [...new Set(els.map((e) => e.textContent?.trim()))]);

test("name search narrows the list", async ({ page }) => {
  await mockApis(page, FILTER_GAMES, FILTER_LOWS);
  await loadWishlist(page);
  await expect(page.getByText("Alpha Sale").first()).toBeVisible();
  await page.getByPlaceholder("게임 이름 검색").fill("brav");
  await expect(page.getByText("Bravo Low").first()).toBeVisible();
  await expect(page.getByText("Alpha Sale")).toHaveCount(0);
  await expect(page.getByText("Charlie Full")).toHaveCount(0);
});

test("the 할인 중 filter keeps only discounted games", async ({ page }) => {
  await mockApis(page, FILTER_GAMES, FILTER_LOWS);
  await loadWishlist(page);
  await expect(page.getByText("Charlie Full").first()).toBeVisible();
  await page
    .getByLabel(/^할인 중/)
    .first()
    .check({ force: true });
  await expect(page.getByText("Charlie Full")).toHaveCount(0);
  expect(await visibleNames(page)).toEqual(
    expect.arrayContaining(["Alpha Sale", "Bravo Low", "Delta Sale"]),
  );
});

test("최저가 아닌 게임 제외 drops only the confirmed not-at-low game", async ({ page }) => {
  await mockApis(page, FILTER_GAMES, FILTER_LOWS);
  await loadWishlist(page);
  await expect(page.locator(".chip.notLowestPrice")).toHaveCount(1);
  await page.getByLabel("최저가 아닌 게임 제외").check({ force: true });
  await expect(page.getByText("Alpha Sale")).toHaveCount(0); // ❌ - excluded
  await expect(page.getByText("Bravo Low").first()).toBeVisible(); // 🏷️ at its low
  await expect(page.getByText("Charlie Full").first()).toBeVisible(); // full price - never judged
  await expect(page.getByText("Delta Sale").first()).toBeVisible(); // no ITAD data - kept
});

test("sorting by discount puts the deepest sale first and full price last", async ({ page }) => {
  await mockApis(page, FILTER_GAMES, FILTER_LOWS);
  await loadWishlist(page);
  await page.getByText("할인율 높은순").first().click();
  await expect
    .poll(async () => (await visibleNames(page)).join("|"))
    .toBe("Bravo Low|Alpha Sale|Delta Sale|Charlie Full");
});

test("creating a purchase poll: pick two games, get a share link", async ({ page }) => {
  await mockApis(page, FILTER_GAMES, FILTER_LOWS);
  let posted: { candidates: { appid: number }[]; question: string } | null = null;
  await page.route("**/api/poll", async (r) => {
    posted = r.request().postDataJSON();
    await r.fulfill({ json: { pollId: "abc123" } });
  });
  await loadWishlist(page);
  await expect(page.getByText("Alpha Sale").first()).toBeVisible();

  await page.getByTitle("더보기").click();
  await page.getByText("구매 투표 만들기").click();
  const create = page.getByRole("button", { name: "투표 링크 만들기" });
  await expect(create).toBeDisabled(); // needs at least 2 picks

  await page.getByText("Alpha Sale").first().click();
  await expect(create).toBeDisabled();
  await page.getByText("Bravo Low").first().click();
  await expect(create).toBeEnabled();
  await create.click();

  await expect(page.getByText("투표 링크가 만들어졌어요!")).toBeVisible();
  await expect(page.locator(".pollLinkInput")).toHaveValue(/\/poll\/abc123$/);
  expect(posted!.candidates.map((c) => c.appid).sort()).toEqual([1, 2]);
  expect(posted!.question).toBe("어떤 게임을 살까요?");
});
