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
import { GENRE_XP_PER_LEVEL_SQ } from "./genres";
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
