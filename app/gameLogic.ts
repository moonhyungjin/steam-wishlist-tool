import {
  type Item,
  type Game,
  type LowestPriceStatus,
  type SortKey,
  type PlayStatus,
  type Rating,
  type StarRating,
  type AchievementInfo,
  type ManualPlatform,
} from "./types";
import {
  GENRE_XP_PER_LEVEL_SQ,
  GENRE_LEVEL_ALLOWLIST_IDS,
  GENRE_LEVEL_CHILDREN,
  GENRE_ALLOWLIST_IDS,
  TASTE_MIN_GAMES,
} from "./genres";
// ITAD hands back a bare number plus an ISO currency code - format it for that currency instead of
// assuming won. Zero-decimal currencies drop the cents; anything Intl can't format falls back to
// "<number> <code>" rather than throwing out of a render.
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency,
      maximumFractionDigits: ["KRW", "JPY", "TWD"].includes(currency) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString("ko-KR")} ${currency}`;
  }
}
export function lowestPriceStatus(
  g: Pick<Game, "discountPercent" | "priceValue" | "lowestPrice"> | undefined,
): LowestPriceStatus {
  if (!g || !(g.discountPercent > 0)) return "none";
  const low = g.lowestPrice;
  if (low === undefined) return "unchecked";
  if (low === null) return "no-data";
  return g.priceValue != null && g.priceValue / 100 <= low.amount ? "at-low" : "not-at-low";
}
// Placeholder for a manually-added game with no Steam match - every other field just means "no
// data available" rather than "really zero/false", since none of it was actually looked up.
export function blankGame(appid: number, name: string): Game {
  return {
    appid,
    name,
    headerImage: null,
    genres: [],
    genreIds: [],
    releaseDate: null,
    releaseTimestamp: null,
    comingSoon: false,
    releaseUnannounced: false,
    earlyAccess: false,
    isFree: false,
    price: "정보 없음",
    initialPrice: null,
    priceValue: null,
    discountPercent: 0,
    discountEndDate: null,
    discountEndTimestamp: null,
    reviewPositive: null,
    koreanSupported: false,
    adultContent: false,
    isDemo: false,
    isDlc: false,
  };
}
// How much a single game's hours count toward its genres' taste score, relative to the 1.0
// baseline "just average" case - deliberately separate from GENRE_XP_PER_LEVEL_SQ's pure-hours
// level curve, since this is about how much the player *liked* the time spent, not how much they
// spent. Tune independently as real data comes in.
export function gameAffinity(
  status: PlayStatus | undefined,
  rating: Rating | undefined,
  star: StarRating | undefined,
  achievement: AchievementInfo | null | undefined,
): number {
  let affinity = 1;
  if (status === "dropped") affinity *= 0.4;
  else if (status === "completed") affinity *= 1.3;
  if (rating === "like") affinity += 0.3;
  else if (rating === "dislike") affinity -= 0.3;
  if (star) affinity += ((star - 3) / 2) * 0.3;
  if (achievement && achievement.percent >= 70) affinity += 0.1;
  return affinity;
}
export function scoreClass(n: number): string {
  return n >= 75 ? "good" : n >= 50 ? "mid" : "bad";
}
export function genreLevelInfo(hours: number) {
  const level = Math.floor(Math.sqrt(hours / GENRE_XP_PER_LEVEL_SQ));
  const thisLevelHours = level ** 2 * GENRE_XP_PER_LEVEL_SQ;
  const nextLevelHours = (level + 1) ** 2 * GENRE_XP_PER_LEVEL_SQ;
  const progress = (hours - thisLevelHours) / (nextLevelHours - thisLevelHours);
  return { level, progress };
}
// Hours-weighted-average taste affinity across whichever of the game's (fine-grained) tags have
// enough library data to carry a taste score - weighted by each matching genre's own game count,
// so a genre backed by 40 games doesn't get diluted by one that just barely cleared the floor.
// null (not 0/neutral) means "no overlapping genre has taste data yet" - that's a different,
// honest state from "known to be a middling match," and sorts to the bottom either way.
export function recommendScore(
  genreIds: number[] | undefined,
  taste: Record<number, { affinity: number; games: number }>,
): number | null {
  let weightSum = 0;
  let scoreSum = 0;
  for (const id of genreIds ?? []) {
    const t = taste[id];
    if (!t) continue;
    weightSum += t.games;
    scoreSum += t.affinity * t.games;
  }
  return weightSum > 0 ? scoreSum / weightSum : null;
}
export function compareByKey(
  key: SortKey,
  a: Item,
  b: Item,
  games: Record<number, Game>,
  achievementMap: Record<number, AchievementInfo | null>,
  genreTaste: Record<number, { affinity: number; games: number }>,
): number {
  const ga = games[a.appid];
  const gb = games[b.appid];
  if (key === "price-asc") return (ga?.priceValue ?? Infinity) - (gb?.priceValue ?? Infinity);
  if (key === "review") return (gb?.reviewPositive ?? -1) - (ga?.reviewPositive ?? -1);
  if (key === "metacritic") return (gb?.metacritic ?? -1) - (ga?.metacritic ?? -1);
  if (key === "playtime-desc") return (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0);
  if (key === "last-played-desc")
    return (b.lastPlayedTimestamp ?? 0) - (a.lastPlayedTimestamp ?? 0);
  if (key === "achievement-desc")
    return (achievementMap[b.appid]?.percent ?? -1) - (achievementMap[a.appid]?.percent ?? -1);
  if (key === "name-asc") return (ga?.name ?? "").localeCompare(gb?.name ?? "", "ko");
  if (key === "discount-end-asc")
    return (ga?.discountEndTimestamp ?? Infinity) - (gb?.discountEndTimestamp ?? Infinity);
  if (key === "discount-desc") return (gb?.discountPercent ?? 0) - (ga?.discountPercent ?? 0);
  if (key === "recommend-desc") {
    const sa = recommendScore(ga?.genreIds, genreTaste);
    const sb = recommendScore(gb?.genreIds, genreTaste);
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa;
  }
  return (gb?.releaseTimestamp ?? -Infinity) - (ga?.releaseTimestamp ?? -Infinity);
}
// Only one sort key applies at a time - combining several numeric criteria as a priority chain
// mostly just reduces to the first one anyway, since exact ties across price/review/etc. are
// rare, so a single, honest "sort by this" is more predictable than a chain that quietly does
// nothing past the first key.
export function sortItems(
  items: Item[],
  games: Record<number, Game>,
  sortKey: SortKey | null,
  achievementMap: Record<number, AchievementInfo | null>,
  genreTaste: Record<number, { affinity: number; games: number }>,
): Item[] {
  if (!sortKey) return items;
  return [...items].sort((a, b) => compareByKey(sortKey, a, b, games, achievementMap, genreTaste));
}
// Steam's achievement endpoint has no batch call and hard rate-limits after ~160 requests
// regardless of pacing, so a big library can't be fully checked in one pass. Rather than burn
// that budget in raw appid order, check whatever the user is actually looking at right now
// (current search/filter/sort) first - the rest still gets picked up on a later reload, since
// results are cached per-appid.
export function prioritizeAchievementOrder(
  list: Item[],
  loaded: Record<number, Game>,
  sortKey: SortKey | null,
  filters: {
    nameQuery: string;
    genreFilter: number[];
    statusFilter: (PlayStatus | "none")[];
    ratingFilter: (Rating | "none")[];
    starFilter: (StarRating | "none")[];
    platformFilter: ("steam" | ManualPlatform)[];
    excludeAdult: boolean;
    excludeDemo: boolean;
    excludeFree: boolean;
    statusMap: Record<number, PlayStatus>;
    ratingMap: Record<number, Rating>;
    starMap: Record<number, StarRating>;
    manualPlatform: Record<number, ManualPlatform>;
  },
): number[] {
  const q = filters.nameQuery.trim().toLowerCase();
  function matches(item: Item): boolean {
    const g = loaded[item.appid];
    if (q && !(g?.name ?? "").toLowerCase().includes(q)) return false;
    if (filters.excludeAdult && g?.adultContent) return false;
    if (filters.excludeDemo && g?.isDemo) return false;
    if (filters.excludeFree && g?.isFree) return false;
    if (
      filters.genreFilter.length &&
      !filters.genreFilter.some((id) => (g?.genreIds ?? []).includes(id))
    )
      return false;
    {
      const s = filters.statusMap[item.appid] ?? "none";
      if (s === "excluded" && !filters.statusFilter.includes("excluded")) return false;
      if (filters.statusFilter.length && !filters.statusFilter.includes(s)) return false;
    }
    if (filters.ratingFilter.length) {
      const r = filters.ratingMap[item.appid] ?? "none";
      if (!filters.ratingFilter.includes(r)) return false;
    }
    if (filters.starFilter.length) {
      const st = filters.starMap[item.appid] ?? "none";
      if (!filters.starFilter.includes(st)) return false;
    }
    if (filters.platformFilter.length) {
      const p = filters.manualPlatform[item.appid] ?? "steam";
      if (!filters.platformFilter.includes(p)) return false;
    }
    return true;
  }
  const matched: Item[] = [];
  const rest: Item[] = [];
  for (const item of list) (matches(item) ? matched : rest).push(item);
  // "achievement-desc" can't be honored here - that's exactly the data this pass produces - so
  // it just falls back to library order for the games being prioritized.
  const ordered =
    sortKey && sortKey !== "achievement-desc"
      ? [...matched].sort((a, b) => compareByKey(sortKey, a, b, loaded, {}, {}))
      : matched;
  return [...ordered, ...rest].map((item) => item.appid);
}
// Tries the Steam client's own library page first (steam:// URIs have no "is this installed"
// API to check ahead of time), and falls back to the web store page if nothing takes over the
// tab shortly after - the classic custom-protocol-link pattern: a successful handoff to another
// app typically blurs the browser window, so no blur within the timeout means it didn't work.
export function openLibraryOrStore(appid: number) {
  const storeUrl = `https://store.steampowered.com/app/${appid}`;
  let handled = false;
  const timer = setTimeout(() => {
    if (handled) return;
    handled = true;
    window.open(storeUrl, "_blank", "noopener,noreferrer");
  }, 1200);
  const onBlur = () => {
    handled = true;
    clearTimeout(timer);
    window.removeEventListener("blur", onBlur);
  };
  window.addEventListener("blur", onBlur);
  window.location.href = `steam://nav/games/details/${appid}`;
}
// enrichMetacritic and enrichLowestPrice both run as independent fire-and-forget background
// passes after the main wishlist load, each tracking its own "current" snapshot starting from the
// same `loaded` base. Applying either one's result with a plain setWlGames(cur) would wholesale-
// replace state with that pass's own (increasingly stale) view - whichever one's update lands
// last would silently erase whatever field the OTHER pass had already written for a game neither
// of them just touched. This merges per-game against the latest live state instead, so concurrent
// passes layer their own field(s) on top of each other instead of stomping.
export function mergeGamesInto(
  prev: Record<number, Game>,
  delta: Record<number, Game>,
): Record<number, Game> {
  const next = { ...prev };
  for (const id of Object.keys(delta)) {
    const appid = Number(id);
    next[appid] = { ...prev[appid], ...delta[appid] };
  }
  return next;
}

export function computeGenreXp(
  combinedLibItems: Item[],
  combinedLibGames: Record<number, Game>,
  statusMap: Record<number, PlayStatus>,
) {
  const xp: Record<number, number> = {};
  const nameById: Record<number, string> = {};
  const gameIds = new Set<number>();
  for (const item of combinedLibItems) {
    const minutes = item.playtimeMinutes;
    if (!minutes) continue;
    if (statusMap[item.appid] === "excluded") continue;
    const g = combinedLibGames[item.appid];
    const matches = (g?.genreIds ?? [])
      .map((id, i) => ({ id, name: g!.genres[i] }))
      .filter((m) => GENRE_LEVEL_ALLOWLIST_IDS.has(m.id));
    if (!matches.length) continue;
    gameIds.add(item.appid);
    // Split evenly across every matched genre rather than crediting each in full - otherwise a
    // broadly-tagged genre (어드벤처, which co-occurs with almost everything) always outranks a
    // narrowly-applied one (전략) purely from tag co-occurrence, not from actually being played
    // more. Verified against real data: 전략 (삼국지/섀도우 갬빗) only overtakes 어드벤처 once
    // split, matching the player's actual stated preference.
    const splitHours = minutes / 60 / matches.length;
    for (const m of matches) {
      nameById[m.id] = m.name;
      xp[m.id] = (xp[m.id] ?? 0) + splitHours;
    }
  }
  // Splitting a game's hours across its matched genres never loses or duplicates hours (each
  // game's own total is preserved, just redistributed), so summing every genre's xp back up
  // gives the real total hours behind this whole picture - reused below for GENRE_LEVELS_MIN_HOURS.
  const totalHours = Object.values(xp).reduce((sum, h) => sum + h, 0);
  return { xp, nameById, gameCount: gameIds.size, totalHours };
}

export function computeGenreTaste(
  combinedLibItems: Item[],
  combinedLibGames: Record<number, Game>,
  statusMap: Record<number, PlayStatus>,
  ratingMap: Record<number, Rating>,
  starMap: Record<number, StarRating>,
  achievementMap: Record<number, AchievementInfo | null>,
) {
  const gameCounts: Record<number, number> = {};
  const hoursByGenre: Record<number, number> = {};
  const weightedByGenre: Record<number, number> = {};
  const nameById: Record<number, string> = {};
  // gameAffinity()'s multiplier assumes a universal "neutral" player (3-star midpoint, status/
  // rating absent = no adjustment) - real libraries skew hard off that (e.g. one real account:
  // 241 completed vs 21 dropped, 247 liked vs 65 disliked, 4.01 avg star), so every genre came
  // out positive against the fixed 1.0 baseline and the taste list lost all discriminating
  // power. Tracking this player's own hours-weighted average affinity (across every played,
  // non-excluded game, regardless of genre match) and recentering each genre against it below
  // fixes that - genres above the player's own average read positive, below read negative,
  // instead of everything reading positive against a baseline nobody's library actually sits at.
  let totalHoursAll = 0;
  let totalWeightedAll = 0;
  for (const item of combinedLibItems) {
    const hours = (item.playtimeMinutes ?? 0) / 60;
    if (!hours) continue;
    const status = statusMap[item.appid];
    if (status === "excluded") continue;
    const rating = ratingMap[item.appid];
    const star = starMap[item.appid];
    // Only count games with a deliberate, fully-recorded opinion (진행 상태 + 추천 + 별점 all
    // set) - hours alone with none of those set is just "was open at some point," not a signal
    // of whether the player actually liked it. 하차 (dropped) is the one exception: dropping a
    // game is already an unambiguous negative signal by itself, so it counts even without a
    // rating/star also being recorded.
    const fullyRated = status != null && rating != null && star != null;
    if (!fullyRated && status !== "dropped") continue;
    const g = combinedLibGames[item.appid];
    const affinity = gameAffinity(status, rating, star, achievementMap[item.appid]);
    totalHoursAll += hours;
    totalWeightedAll += hours * affinity;
    const matches = (g?.genreIds ?? [])
      .map((id, i) => ({ id, name: g!.genres[i] }))
      .filter((m) => GENRE_ALLOWLIST_IDS.has(m.id));
    if (!matches.length) continue;
    // Hours split the same way as genreXp (see its comment) - gameCounts stays unsplit, since
    // "this genre showed up in N games" is a sample-size count, not a time budget.
    const splitHours = hours / matches.length;
    for (const m of matches) {
      nameById[m.id] = m.name;
      gameCounts[m.id] = (gameCounts[m.id] ?? 0) + 1;
      hoursByGenre[m.id] = (hoursByGenre[m.id] ?? 0) + splitHours;
      weightedByGenre[m.id] = (weightedByGenre[m.id] ?? 0) + splitHours * affinity;
    }
  }
  const personalAvg = totalHoursAll > 0 ? totalWeightedAll / totalHoursAll : 1;
  return Object.entries(gameCounts)
    .filter(([, count]) => count >= TASTE_MIN_GAMES)
    .map(([id, count]) => ({
      genreId: Number(id),
      genre: nameById[Number(id)],
      games: count,
      // Recentered around this player's own average (see comment above), not an absolute 1.0 -
      // still expressed on the same "1.0 = neutral" scale every consumer (recommendScore, the
      // taste chart, the recommend chip) already expects, so nothing downstream needs to change.
      affinity: weightedByGenre[Number(id)] / hoursByGenre[Number(id)] - personalAvg + 1,
    }))
    .sort((a, b) => b.affinity - a.affinity);
}

export function computeRecommendPercentile(
  wlItems: Item[],
  wlGames: Record<number, Game>,
  genreTasteMap: Record<number, { affinity: number; games: number }>,
): Record<number, number> {
  if (Object.keys(genreTasteMap).length === 0) return {};
  const scored = wlItems
    .map((item) => ({
      appid: item.appid,
      score: recommendScore(wlGames[item.appid]?.genreIds, genreTasteMap),
    }))
    .filter((x): x is { appid: number; score: number } => x.score != null)
    .sort((a, b) => a.score - b.score);
  const n = scored.length;
  const map: Record<number, number> = {};
  // Tied scores (same genre-match set) must share one percentile - rank by the last index of the
  // tie group instead of each game's own sort position, which would otherwise rank identical games
  // differently by arbitrary sort order.
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scored[j + 1].score === scored[i].score) j++;
    const pct = n > 1 ? Math.round((j / (n - 1)) * 100) : 100;
    for (let k = i; k <= j; k++) map[scored[k].appid] = pct;
    i = j + 1;
  }
  return map;
}

// For each broad level genre: how its hours break down across the sub-genre tags the games carry
// (see GENRE_LEVEL_CHILDREN). Uses the same per-game split as computeGenreXp - a game's hours
// first divide across its matched broad genres, then each broad genre's share divides across the
// sub-genres that game has under it. A game with no sub-genre under a parent lands in `other`.
export type GenreBreakdown = {
  children: { id: number; name: string; hours: number }[];
  other: number;
};
export function computeGenreBreakdown(
  combinedLibItems: Item[],
  combinedLibGames: Record<number, Game>,
  statusMap: Record<number, PlayStatus>,
): Record<number, GenreBreakdown> {
  const acc: Record<
    number,
    { kids: Record<number, { name: string; hours: number }>; other: number }
  > = {};
  for (const item of combinedLibItems) {
    const minutes = item.playtimeMinutes;
    if (!minutes) continue;
    if (statusMap[item.appid] === "excluded") continue;
    const g = combinedLibGames[item.appid];
    const ids = g?.genreIds ?? [];
    const parents = ids.filter((id) => GENRE_LEVEL_ALLOWLIST_IDS.has(id));
    if (!parents.length) continue;
    const share = minutes / 60 / parents.length;
    for (const parent of parents) {
      const entry = (acc[parent] ??= { kids: {}, other: 0 });
      const kidIds = ids.filter((id) => GENRE_LEVEL_CHILDREN[parent]?.includes(id));
      if (!kidIds.length) {
        entry.other += share;
        continue;
      }
      for (const kid of kidIds) {
        const k = (entry.kids[kid] ??= { name: g!.genres[ids.indexOf(kid)], hours: 0 });
        k.hours += share / kidIds.length;
      }
    }
  }
  const out: Record<number, GenreBreakdown> = {};
  for (const [parent, { kids, other }] of Object.entries(acc)) {
    out[Number(parent)] = {
      children: Object.entries(kids)
        .map(([id, k]) => ({ id: Number(id), name: k.name, hours: k.hours }))
        .sort((a, b) => b.hours - a.hours),
      other,
    };
  }
  return out;
}
