import { test } from "@playwright/test";
import { loadWishlist, mockApis } from "./helpers";

// Not an assertion test - prints interaction latencies on a 900-game wishlist so regressions in
// re-render cost are visible. Skipped unless PERF=1.
test.skip(!process.env.PERF, "set PERF=1 to run");

test("interaction latency on 900 games", async ({ page }) => {
  const games = Array.from({ length: 900 }, (_, i) => ({
    appid: 1000 + i,
    name: `Game ${i}`,
    priceValue: 1000000,
    discountPercent: i % 3 === 0 ? 30 : 0,
  }));
  await mockApis(page, games);
  await loadWishlist(page);
  await page.getByText("Game 0").first().waitFor();
  await page.waitForTimeout(1500);

  const measure = (label: string, action: () => Promise<void>) =>
    page
      .evaluate(() => {
        (window as any).__t0 = performance.now();
      })
      .then(action)
      .then(() =>
        page.evaluate(
          () =>
            new Promise<number>((res) =>
              requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - (window as any).__t0))),
            ),
        ),
      )
      .then((ms) => console.log(`${label}: ${ms.toFixed(0)}ms`));

  const search = page.getByPlaceholder("게임 이름 검색");
  await measure("type 1 char in search", () => search.press("g"));
  await measure("type 2nd char", () => search.press("a"));
  await measure("clear search", () => search.fill(""));
  await measure("toggle 할인 중 filter", () => page.getByLabel(/할인 중/).first().check({ force: true }));
  await measure("toggle it off", () => page.getByLabel(/할인 중/).first().uncheck({ force: true }));
});
