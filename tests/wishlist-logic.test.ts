import { describe, expect, it } from "vitest";
import {
  blankGame,
  compareByKey,
  formatMoney,
  gameAffinity,
  genreLevelInfo,
  lowestPriceStatus,
  mergeGamesInto,
  recommendScore,
  sortItems,
  type Game,
} from "../app/wishlist";

const game = (appid: number, over: Partial<Game> = {}): Game => ({
  ...blankGame(appid, `game${appid}`),
  ...over,
});
const low = (amount: number) => ({ amount, currency: "KRW", cut: 80, shop: "Steam", timestamp: null });

describe("lowestPriceStatus", () => {
  it("is none for full-price games even with a stale stored low (the bug fixed 2026-10-14)", () => {
    expect(lowestPriceStatus(game(1, { discountPercent: 0, lowestPrice: low(1000), priceValue: 5000000 }))).toBe("none");
    expect(lowestPriceStatus(game(1, { discountPercent: 0, lowestPrice: null }))).toBe("none");
  });
  it("is none for a missing game", () => {
    expect(lowestPriceStatus(undefined)).toBe("none");
  });
  it("distinguishes unchecked / no-data on a discounted game", () => {
    expect(lowestPriceStatus(game(1, { discountPercent: 50 }))).toBe("unchecked");
    expect(lowestPriceStatus(game(1, { discountPercent: 50, lowestPrice: null }))).toBe("no-data");
  });
  it("compares Steam's cents-scaled price against ITAD's plain amount", () => {
    // 10,000 KRW = 1,000,000 in Steam's cents
    expect(lowestPriceStatus(game(1, { discountPercent: 50, priceValue: 1000000, lowestPrice: low(10000) }))).toBe("at-low");
    expect(lowestPriceStatus(game(1, { discountPercent: 50, priceValue: 900000, lowestPrice: low(10000) }))).toBe("at-low");
    expect(lowestPriceStatus(game(1, { discountPercent: 50, priceValue: 1000100, lowestPrice: low(10000) }))).toBe("not-at-low");
  });
  it("treats an unknown price as not at the low", () => {
    expect(lowestPriceStatus(game(1, { discountPercent: 50, priceValue: null, lowestPrice: low(10000) }))).toBe("not-at-low");
  });
});

describe("formatMoney", () => {
  it("drops cents for KRW/JPY/TWD and keeps them elsewhere", () => {
    expect(formatMoney(12345, "KRW")).toContain("12,345");
    expect(formatMoney(12345, "KRW")).not.toContain(".");
    expect(formatMoney(9.99, "USD")).toContain("9.99");
  });
  it("falls back instead of throwing on an invalid currency code", () => {
    expect(formatMoney(1234.4, "NOT_A_CODE")).toBe("1,234 NOT_A_CODE");
  });
});

describe("genreLevelInfo", () => {
  it("follows the quadratic curve (level N needs N^2 * 5 hours)", () => {
    expect(genreLevelInfo(0)).toEqual({ level: 0, progress: 0 });
    expect(genreLevelInfo(5).level).toBe(1);
    expect(genreLevelInfo(19.9).level).toBe(1);
    expect(genreLevelInfo(20).level).toBe(2);
    expect(genreLevelInfo(12.5).progress).toBeCloseTo(0.5); // halfway between 5h and 20h
  });
});

describe("gameAffinity", () => {
  it("is a neutral 1 with no signals", () => {
    expect(gameAffinity(undefined, undefined, undefined, undefined)).toBe(1);
  });
  it("lowers dropped, raises completed, and applies like/dislike", () => {
    expect(gameAffinity("dropped", undefined, undefined, undefined)).toBeCloseTo(0.4);
    expect(gameAffinity("completed", undefined, undefined, undefined)).toBeCloseTo(1.3);
    expect(gameAffinity(undefined, "like", undefined, undefined)).toBeCloseTo(1.3);
    expect(gameAffinity(undefined, "dislike", undefined, undefined)).toBeCloseTo(0.7);
  });
  it("centers stars on 3 and rewards high achievement completion", () => {
    expect(gameAffinity(undefined, undefined, 3, undefined)).toBe(1);
    expect(gameAffinity(undefined, undefined, 5, undefined)).toBeCloseTo(1.3);
    expect(gameAffinity(undefined, undefined, undefined, { achieved: 7, total: 10, percent: 70 })).toBeCloseTo(1.1);
    expect(gameAffinity(undefined, undefined, undefined, { achieved: 6, total: 10, percent: 60 })).toBe(1);
  });
});

describe("recommendScore", () => {
  const taste = { 1: { affinity: 2, games: 3 }, 2: { affinity: 1, games: 1 } };
  it("weights each genre's affinity by its game count", () => {
    expect(recommendScore([1, 2], taste)).toBeCloseTo((2 * 3 + 1 * 1) / 4);
  });
  it("is null (not 0) when no genre has taste data", () => {
    expect(recommendScore([99], taste)).toBeNull();
    expect(recommendScore(undefined, taste)).toBeNull();
  });
});

describe("sorting", () => {
  const games = {
    1: game(1, { name: "b", priceValue: 3000, discountPercent: 10, reviewPositive: 90 }),
    2: game(2, { name: "a", priceValue: 1000, discountPercent: 70, reviewPositive: 70 }),
    3: game(3, { name: "c", priceValue: null, discountPercent: 0, reviewPositive: null }),
  };
  const items = [{ appid: 1 }, { appid: 2 }, { appid: 3 }];
  const ids = (key: Parameters<typeof sortItems>[2]) =>
    sortItems(items, games, key, {}, {}).map((i) => i.appid);

  it("returns the input untouched without a sort key", () => {
    expect(sortItems(items, games, null, {}, {})).toBe(items);
  });
  it("sorts price ascending with unknown prices last", () => {
    expect(ids("price-asc")).toEqual([2, 1, 3]);
  });
  it("sorts discount descending and reviews descending with unknown last", () => {
    expect(ids("discount-desc")).toEqual([2, 1, 3]);
    expect(ids("review")).toEqual([1, 2, 3]);
  });
  it("sorts names in Korean collation order", () => {
    expect(ids("name-asc")).toEqual([2, 1, 3]);
  });
  it("puts games with no recommend score last and keeps ties stable", () => {
    const taste = { 5: { affinity: 2, games: 1 } };
    const g = { 1: game(1, { genreIds: [5] }), 2: game(2), 3: game(3) };
    expect(compareByKey("recommend-desc", { appid: 1 }, { appid: 2 }, g, {}, taste)).toBe(-1);
    expect(compareByKey("recommend-desc", { appid: 2 }, { appid: 3 }, g, {}, taste)).toBe(0);
  });
  it("does not mutate the original array", () => {
    const copy = [...items];
    sortItems(items, games, "price-asc", {}, {});
    expect(items).toEqual(copy);
  });
});

describe("mergeGamesInto", () => {
  it("keeps enrichment fields the fresh fetch doesn't know about", () => {
    const prev = { 1: game(1, { metacritic: 88, lowestPrice: low(500), lowestPriceCheckedForEnd: 123 }) };
    const fresh = { 1: game(1, { priceValue: 700, discountPercent: 30 }) };
    const merged = mergeGamesInto(prev, fresh);
    expect(merged[1].priceValue).toBe(700);
    expect(merged[1].metacritic).toBe(88);
    expect(merged[1].lowestPrice).toEqual(low(500));
    expect(merged[1].lowestPriceCheckedForEnd).toBe(123);
  });
  it("returns a new object so React can see the update", () => {
    const prev = { 1: game(1) };
    expect(mergeGamesInto(prev, {})).not.toBe(prev);
  });
});
