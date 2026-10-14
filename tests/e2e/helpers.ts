import type { Page } from "@playwright/test";

export const STEAM_ID = "76561198000000000";

type MockGame = {
  appid: number;
  name: string;
  priceValue: number | null; // Steam cents-scaled (10000 KRW = 1000000)
  discountPercent?: number;
  price?: string;
};

function fullGame(g: MockGame) {
  const discountPercent = g.discountPercent ?? 0;
  return {
    appid: g.appid,
    name: g.name,
    headerImage: null,
    genres: ["액션"],
    genreIds: [19],
    releaseDate: "2024년 1월 1일",
    releaseTimestamp: 1704067200,
    comingSoon: false,
    releaseUnannounced: false,
    earlyAccess: false,
    isFree: false,
    price: g.price ?? (g.priceValue == null ? "정보 없음" : `₩ ${(g.priceValue / 100).toLocaleString()}`),
    initialPrice: discountPercent ? "₩ 20,000" : null,
    priceValue: g.priceValue,
    discountPercent,
    discountEndDate: discountPercent ? "2030년 1월 1일" : null,
    discountEndTimestamp: discountPercent ? 1893456000 : null,
    reviewPositive: 90,
    koreanSupported: true,
    adultContent: false,
    isDemo: false,
    isDlc: false,
  };
}

// Replaces every backend call the wishlist page makes with canned data, so the tests never touch
// Steam, ITAD or Redis. lows maps appid -> ITAD all-time-low amount (plain currency, not cents).
// `games` may be a function so a test can change what the "server" returns between loads.
export async function mockApis(
  page: Page,
  gamesSource: MockGame[] | (() => MockGame[]),
  lows: Record<number, number> = {},
) {
  const current = () => (typeof gamesSource === "function" ? gamesSource() : gamesSource);
  await page.route("**/api/wishlist**", (r) =>
    r.fulfill({
      json: { steamid: STEAM_ID, count: current().length, items: current().map((g) => ({ appid: g.appid })) },
    }),
  );
  await page.route("**/api/games**", (r) => {
    const ids = (new URL(r.request().url()).searchParams.get("appids") ?? "").split(",").map(Number);
    const out: Record<number, ReturnType<typeof fullGame>> = {};
    for (const g of current()) if (ids.includes(g.appid)) out[g.appid] = fullGame(g);
    return r.fulfill({ json: { games: out } });
  });
  await page.route("**/api/lowestprice**", (r) => {
    const ids = (new URL(r.request().url()).searchParams.get("appids") ?? "").split(",").map(Number);
    const prices: Record<number, unknown> = {};
    for (const id of ids)
      if (id in lows)
        prices[id] = { amount: lows[id], currency: "KRW", cut: 80, shop: "Steam", timestamp: null };
    return r.fulfill({ json: { prices, configured: true } });
  });
  await page.route("**/api/metacritic**", (r) => r.fulfill({ json: { scores: {} } }));
  await page.route("**/api/profile**", (r) => r.fulfill({ json: { profile: null } }));
  await page.route("**/api/sync**", (r) => r.fulfill({ json: {} }));
}

export async function loadWishlist(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("Steam ID64").fill(STEAM_ID);
  await page.getByRole("button", { name: "찜목록 가져오기" }).click();
}
