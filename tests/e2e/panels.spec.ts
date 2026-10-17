import { expect, test, type Page } from "@playwright/test";
import { loadLibrary, mockApis, mockLibrary } from "./helpers";

// The ⋯ menu's panels: one open at a time, picking the open one again closes it, library-only
// panels close when leaving the library tab, and starting a poll closes the open panel.
const games = [1, 2, 3].map((appid) => ({ appid, name: `Game ${appid}`, priceValue: 1000000 }));

async function setup(page: Page) {
  await mockApis(page, games);
  await mockLibrary(page, [1, 2, 3]);
  await page.route("**/api/my-polls**", (r) =>
    r.fulfill({ json: { configured: true, polls: [] } }),
  );
  await loadLibrary(page);
  await expect(page.getByText("Game 1").first()).toBeVisible();
}
async function menu(page: Page, label: string) {
  await page.getByTitle("더보기").click();
  await page.locator(".moreActionsMenu").getByText(label).click();
}
const panel = (page: Page, title: string) => page.locator(".myPollsPanel", { hasText: title });

test("opening another panel closes the previous one; picking the open one again closes it", async ({
  page,
}) => {
  await setup(page);
  await menu(page, "국가 설정");
  await expect(panel(page, "스토어 국가")).toBeVisible();
  await menu(page, "동기화 코드");
  await expect(panel(page, "동기화 코드")).toBeVisible();
  await expect(panel(page, "스토어 국가")).toHaveCount(0);

  await page.getByTitle("더보기").click();
  await expect(page.locator(".moreActionsItem.open")).toHaveText(/동기화 코드/);
  await page.locator(".moreActionsMenu").getByText("동기화 코드").click();
  await expect(panel(page, "동기화 코드")).toHaveCount(0);

  await menu(page, "게임 추가하기");
  await expect(panel(page, "게임 추가")).toBeVisible();
  await menu(page, "게임 추가하기");
  await expect(panel(page, "게임 추가")).toHaveCount(0);
});

test("library-only panels close when switching to the wishlist tab", async ({ page }) => {
  await setup(page);
  await menu(page, "동기화 코드");
  await expect(panel(page, "동기화 코드")).toBeVisible();
  await page.getByRole("button", { name: "찜목록", exact: true }).click();
  await expect(panel(page, "동기화 코드")).toHaveCount(0);
  await page.getByRole("button", { name: "라이브러리", exact: true }).click();
  await expect(panel(page, "동기화 코드")).toHaveCount(0);
});

test("starting a poll closes the open panel; opening a panel keeps the poll", async ({ page }) => {
  await setup(page);
  await menu(page, "내가 만든 투표");
  await expect(panel(page, "내가 만든 투표")).toBeVisible();
  await menu(page, "플레이 투표 만들기");
  await expect(page.locator(".pollBar")).toBeVisible();
  await expect(panel(page, "내가 만든 투표")).toHaveCount(0);

  await page.getByText("Game 1").first().click(); // pick a game
  await menu(page, "국가 설정");
  await expect(panel(page, "스토어 국가")).toBeVisible();
  await expect(page.locator(".pollBar")).toContainText("1개 선택됨");
});
