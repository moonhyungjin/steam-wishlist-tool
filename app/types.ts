export type Item = { appid: number; playtimeMinutes?: number; lastPlayedTimestamp?: number | null };
export type View = "wishlist" | "library";
// The panels the toolbar's ⋯ menu opens above the list - at most one at a time.
export type ToolbarPanel = "manual" | "country" | "sync" | "myPolls";
export type Profile = {
  personaName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
};
export type Game = {
  appid: number;
  name: string;
  headerImage: string | null;
  genres: string[];
  // Same order/length as genres - raw Steam tagids, used for allowlist matching instead of
  // string comparison (see GENRE_ALLOWLIST_IDS/GENRE_LEVEL_ALLOWLIST_IDS).
  genreIds: number[];
  releaseDate: string | null;
  releaseTimestamp: number | null;
  comingSoon: boolean;
  releaseUnannounced: boolean;
  earlyAccess: boolean;
  isFree: boolean;
  price: string;
  initialPrice: string | null;
  priceValue: number | null;
  discountPercent: number;
  discountEndDate: string | null;
  discountEndTimestamp: number | null;
  reviewPositive: number | null;
  // undefined means "not checked yet", null means "checked, this game has no Metacritic score" -
  // see enrichMetacritic. Was a plain `number | null` with no undefined state, which meant every
  // scoreless game got silently retried on every single load forever (nothing distinguished
  // "never checked" from "confirmed none" - both were just null).
  metacritic?: number | null;
  koreanSupported: boolean;
  adultContent: boolean;
  isDemo: boolean;
  // Only ever known true via the manual-add search flow (Steam's public storesearch tells DLC
  // apart from base games directly) - /api/games (the store-page lookup used for owned/wishlist
  // games) has no reliable way to tell, so it always reports false there.
  isDlc: boolean;
  // All-time low across every shop ITAD tracks (not Steam-only) - undefined means "not checked
  // yet", null means "checked, ITAD has no price history for this game" (see enrichLowestPrice).
  lowestPrice?: LowestPrice | null;
  // discountEndTimestamp as of the last time lowestPrice was actually fetched - lets
  // enrichLowestPrice tell "still the same sale I already checked" (skip) from "a new sale
  // started since" (worth re-checking, since this new sale could itself be a fresh record low).
  lowestPriceCheckedForEnd?: number | null;
};
export type LowestPrice = {
  amount: number;
  currency: string;
  cut: number;
  shop: string;
  timestamp: string | null;
};
// The price chip's all-time-low state for one game. Only meaningful while the game is actually on
// sale - a stored lowestPrice outlives the sale it was fetched for, so a full-price game must
// report "none" instead of a stale verdict. "unchecked" = on sale but not looked up yet,
// "no-data" = ITAD has no Steam price history, "at-low"/"not-at-low" compare the current price
// (priceValue is Steam's cents-scaled price; ITAD's amount is already plain currency, hence /100).
export type LowestPriceStatus = "none" | "unchecked" | "no-data" | "at-low" | "not-at-low";
export type SortKey =
  | "price-asc"
  | "review"
  | "metacritic"
  | "release-desc"
  | "discount-end-asc"
  | "discount-desc"
  | "playtime-desc"
  | "achievement-desc"
  | "name-asc"
  | "recommend-desc"
  | "last-played-desc";
// "planned" (미플레이) was dropped as a status: as a chip choice it means the same thing as no
// status at all (미분류), so it added a redundant button without adding information.
export type PlayStatus = "playing" | "completed" | "incomplete" | "dropped" | "excluded";
export type Rating = "like" | "dislike";
// "별점" - purely personal enjoyment, separate from whether I'd recommend it to someone else.
// Half-star increments (1~5, step 0.5).
export type StarRating = 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;
export type AchievementInfo = { achieved: number; total: number; percent: number };
// Games bought outside Steam (Epic, STOVE, ...) with no API to pull from - added by hand, matched
// by name against Steam's public search purely for metadata (image/genres/metacritic), completely
// unrelated to whether this Steam account actually owns them. Kept in their own storage key, apart
// from the Steam-fetched library cache, so a library refresh never wipes them.
// "steam" here means a Steam-owned appid (usually DLC) that didn't come through the normal
// GetOwnedGames sync and has to be tracked by hand instead - distinct from the *absence* of a
// manualPlatform entry, which implicitly means "steam" too (a genuinely-synced library item).
// Both resolve to the same "steam" bucket everywhere platform is counted/filtered (see
// platformCounts's `manualPlatform[item.appid] ?? "steam"` pattern) - the two states are only
// ever different in whether there's a remove (×) button and whether it's manually tracked at all.
export type ManualPlatform = "steam" | "epic" | "stove" | "other";
export type MyPoll = {
  pollId: string;
  question: string;
  createdAt: number;
  candidateCount: number;
  totalVotes: number;
  leader: { name: string; votes: number } | null;
};
