import { describe, expect, it } from "vitest";
import {
  blankGame,
  compareByKey,
  computeGenreBreakdown,
  computeGenreTaste,
  computeGenreXp,
  computeRecommendPercentile,
  formatMoney,
  gameAffinity,
  genreLevelInfo,
  lowestPriceStatus,
  mergeGamesInto,
  recommendScore,
  sortItems,
} from "../app/gameLogic";
import type { Game } from "../app/types";

const game = (appid: number, over: Partial<Game> = {}): Game => ({
  ...blankGame(appid, `game${appid}`),
  ...over,
});
const low = (amount: number) => ({
  amount,
  currency: "KRW",
  cut: 80,
  shop: "Steam",
  timestamp: null,
});

describe("lowestPriceStatus", () => {
  it("is none for full-price games even with a stale stored low (the bug fixed 2026-10-14)", () => {
    expect(
      lowestPriceStatus(
        game(1, { discountPercent: 0, lowestPrice: low(1000), priceValue: 5000000 }),
      ),
    ).toBe("none");
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
    expect(
      lowestPriceStatus(
        game(1, { discountPercent: 50, priceValue: 1000000, lowestPrice: low(10000) }),
      ),
    ).toBe("at-low");
    expect(
      lowestPriceStatus(
        game(1, { discountPercent: 50, priceValue: 900000, lowestPrice: low(10000) }),
      ),
    ).toBe("at-low");
    expect(
      lowestPriceStatus(
        game(1, { discountPercent: 50, priceValue: 1000100, lowestPrice: low(10000) }),
      ),
    ).toBe("not-at-low");
  });
  it("treats an unknown price as not at the low", () => {
    expect(
      lowestPriceStatus(
        game(1, { discountPercent: 50, priceValue: null, lowestPrice: low(10000) }),
      ),
    ).toBe("not-at-low");
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
    expect(
      gameAffinity(undefined, undefined, undefined, { achieved: 7, total: 10, percent: 70 }),
    ).toBeCloseTo(1.1);
    expect(
      gameAffinity(undefined, undefined, undefined, { achieved: 6, total: 10, percent: 60 }),
    ).toBe(1);
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
    const prev = {
      1: game(1, { metacritic: 88, lowestPrice: low(500), lowestPriceCheckedForEnd: 123 }),
    };
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

describe("genre level / taste / recommendation (feature flag is still off in production)", () => {
  const A = 19; // 액션
  const R = 122; // RPG
  const mk = (appid: number, ids: number[], names: string[]): Game => ({
    ...game(appid),
    genreIds: ids,
    genres: names,
  });
  const libGames = (n: number, ids: number[], names: string[], from = 1) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [from + i, mk(from + i, ids, names)]));
  const items = (appids: number[], minutes: number) =>
    appids.map((appid) => ({ appid, playtimeMinutes: minutes }));

  it("splits a game's hours evenly across its matched genres and preserves the total", () => {
    const games = { 1: mk(1, [A, R], ["액션", "RPG"]) };
    const r = computeGenreXp(items([1], 600), games, {});
    expect(r.xp[A]).toBeCloseTo(5);
    expect(r.xp[R]).toBeCloseTo(5);
    expect(r.totalHours).toBeCloseTo(10);
    expect(r.gameCount).toBe(1);
  });
  it("ignores excluded games, unplayed games and non-allowlisted tags", () => {
    const games = {
      1: mk(1, [A], ["액션"]),
      2: mk(2, [A], ["액션"]),
      3: mk(3, [999999], ["귀여운"]),
    };
    const r = computeGenreXp(
      [
        { appid: 1, playtimeMinutes: 600 },
        { appid: 2, playtimeMinutes: 0 },
        { appid: 3, playtimeMinutes: 600 },
      ],
      games,
      { 1: "excluded" },
    );
    expect(r.totalHours).toBe(0);
    expect(r.gameCount).toBe(0);
  });

  it("taste needs 12+ fully-rated games per genre (dropped counts without a rating)", () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    const games = libGames(12, [A], ["액션"]);
    const full = Object.fromEntries(ids.map((i) => [i, "completed" as const]));
    const like = Object.fromEntries(ids.map((i) => [i, "like" as const]));
    const star = Object.fromEntries(ids.map((i) => [i, 4 as const]));
    expect(computeGenreTaste(items(ids, 600), games, full, like, star, {})).toHaveLength(1);
    // one fewer game -> below TASTE_MIN_GAMES, no taste entry
    expect(computeGenreTaste(items(ids.slice(1), 600), games, full, like, star, {})).toHaveLength(
      0,
    );
    // status only (no rating/star) doesn't count...
    expect(computeGenreTaste(items(ids, 600), games, full, {}, {}, {})).toHaveLength(0);
    // ...but dropped does
    const dropped = Object.fromEntries(ids.map((i) => [i, "dropped" as const]));
    expect(computeGenreTaste(items(ids, 600), games, dropped, {}, {}, {})).toHaveLength(1);
  });
  it("recenters affinity on the player's own average (liked genre > 1, disliked genre < 1)", () => {
    const a = libGames(12, [A], ["액션"], 1);
    const r = libGames(12, [R], ["RPG"], 100);
    const games = { ...a, ...r };
    const all = [...Object.keys(a), ...Object.keys(r)].map(Number);
    const status = Object.fromEntries(all.map((i) => [i, "completed" as const]));
    const rating = Object.fromEntries(
      all.map((i) => [i, i < 100 ? ("like" as const) : ("dislike" as const)]),
    );
    const star = Object.fromEntries(all.map((i) => [i, i < 100 ? (5 as const) : (1 as const)]));
    const t = computeGenreTaste(items(all, 600), games, status, rating, star, {});
    const byId = Object.fromEntries(t.map((x) => [x.genreId, x.affinity]));
    expect(byId[A]).toBeGreaterThan(1);
    expect(byId[R]).toBeLessThan(1);
    expect(t[0].genreId).toBe(A); // sorted best first
  });

  it("recommend percentile: games with identical genre sets get the same percentile", () => {
    const taste = { [A]: { affinity: 1.2, games: 20 }, [R]: { affinity: 0.8, games: 20 } };
    const wl = {
      1: mk(1, [A], ["액션"]),
      2: mk(2, [A], ["액션"]),
      3: mk(3, [R], ["RPG"]),
    };
    const p = computeRecommendPercentile([{ appid: 1 }, { appid: 2 }, { appid: 3 }], wl, taste);
    expect(p[3]).toBe(0);
    expect(p[1]).toBe(p[2]);
    expect(p[1]).toBe(100);
  });
});

describe("computeGenreBreakdown (sub-genre detail under each broad level)", () => {
  const mk = (appid: number, ids: number[], names: string[]): Game => ({
    ...game(appid),
    genreIds: ids,
    genres: names,
  });
  it("credits a child to every parent it belongs to, with each parent's share of the hours", () => {
    // 액션(19) + 액션 RPG(4231) + RPG(122), 10h: 5h to 액션, 5h to RPG; 액션 RPG is under both
    const games = { 1: mk(1, [19, 4231, 122], ["액션", "액션 RPG", "RPG"]) };
    const b = computeGenreBreakdown([{ appid: 1, playtimeMinutes: 600 }], games, {});
    expect(b[19].children).toEqual([{ id: 4231, name: "액션 RPG", hours: 5 }]);
    expect(b[122].children).toEqual([{ id: 4231, name: "액션 RPG", hours: 5 }]);
    expect(b[19].other).toBe(0);
  });
  it("splits a parent's share evenly across the sub-genres a game has, and sorts biggest first", () => {
    const games = {
      1: mk(1, [122, 4434], ["RPG", "JRPG"]),
      2: mk(2, [122, 4434, 4474], ["RPG", "JRPG", "CRPG"]),
    };
    const b = computeGenreBreakdown(
      [
        { appid: 1, playtimeMinutes: 600 },
        { appid: 2, playtimeMinutes: 600 },
      ],
      games,
      {},
    );
    expect(b[122].children.map((c) => [c.id, c.hours])).toEqual([
      [4434, 15],
      [4474, 5],
    ]);
  });
  it("puts hours with no sub-genre into 'other' and ignores excluded/unplayed games", () => {
    const games = { 1: mk(1, [122], ["RPG"]), 2: mk(2, [122, 4434], ["RPG", "JRPG"]) };
    const b = computeGenreBreakdown(
      [
        { appid: 1, playtimeMinutes: 120 },
        { appid: 2, playtimeMinutes: 600 },
      ],
      games,
      { 2: "excluded" },
    );
    expect(b[122].other).toBeCloseTo(2);
    expect(b[122].children).toEqual([]);
  });
  it("children plus other add back up to the genre's total hours", () => {
    const games = { 1: mk(1, [19, 1628, 1625], ["액션", "메트로배니아", "플랫폼"]) };
    const items = [{ appid: 1, playtimeMinutes: 900 }];
    const xp = computeGenreXp(items, games, {});
    const b = computeGenreBreakdown(items, games, {});
    for (const id of [19, 1625]) {
      const sum = b[id].children.reduce((t, c) => t + c.hours, 0) + b[id].other;
      expect(sum).toBeCloseTo(xp.xp[id]);
    }
  });
});
