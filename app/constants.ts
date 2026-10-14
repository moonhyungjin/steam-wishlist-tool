import {
  type SortKey,
  type PlayStatus,
  type Rating,
  type StarRating,
  type ManualPlatform,
} from "./types";
export const WISHLIST_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "price-asc", label: "가격 낮은순" },
  { value: "discount-desc", label: "할인율 높은순" },
  { value: "review", label: "긍정 비율 높은순" },
  { value: "metacritic", label: "메타크리틱 높은순" },
  { value: "recommend-desc", label: "추천도 높은순" },
  { value: "release-desc", label: "출시일 최신순" },
  { value: "discount-end-asc", label: "할인 종료 임박순" },
];
// Review/Metacritic/release date aren't shown as badges in the library view (they're wishlist
// buying-decision signals), so sorting by them there would be judging games on numbers the user
// can't actually see - achievement % and playtime are what's visible in this view.
export const LIBRARY_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "playtime-desc", label: "플레이타임 높은순" },
  { value: "last-played-desc", label: "최근 플레이한순" },
  { value: "achievement-desc", label: "업적 비율 높은순(미완성)" },
  { value: "name-asc", label: "이름순" },
];
export const STATUS_LABELS: Record<PlayStatus, string> = {
  playing: "플레이중",
  completed: "완료",
  incomplete: "보류",
  dropped: "하차",
  excluded: "제외",
};
export const STATUS_ORDER: PlayStatus[] = [
  "playing",
  "completed",
  "incomplete",
  "dropped",
  "excluded",
];
// Same tokens as the app's existing good/mid/bad score coloring (scoreClass) - a completed game
// reads as "good" the same way a high review score does, dropped as "bad", etc. '제외' stays
// muted since it isn't a judgment on the game, just an opt-out.
export const STATUS_COLORS: Record<PlayStatus, string> = {
  playing: "#66c0f4",
  completed: "#6bd68a",
  incomplete: "#f5d06e",
  dropped: "#ef7a86",
  excluded: "#91a0b4",
};
export const STATUS_STORAGE_KEY = "library:status";
export const RATING_EMOJI: Record<Rating, string> = { like: "👍", dislike: "👎" };
export const RATING_LABELS: Record<Rating, string> = { like: "추천", dislike: "비추천" };
export const RATING_STORAGE_KEY = "library:rating";
export const STAR_VALUES: StarRating[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
export const STAR_STORAGE_KEY = "library:stars";
export const ACHIEVEMENT_STORAGE_KEY = "library:achievements";
// /api/achievements caps at 100 appids/request now (raised from 40) - this only cuts down on
// round trips to *our own* server, not the actual pace against Steam's fragile per-game endpoint:
// the route still processes 5 at a time with a 150ms gap between batches regardless of how many
// appids arrive in one request, and Steam's own per-session rate limit (roughly ~160 total calls
// before it starts blocking) is unaffected by how we group requests into it either way. So this
// helps a library recover from a wiped achievementMap slightly faster (fewer HTTP round trips),
// but doesn't raise the ceiling on how much gets checked before Steam cuts the session off.
export const ACHIEVEMENT_CHUNK = 100;
// How many of the most-recently-played games get force-refreshed on "새로고침" - see the call
// site in loadLibrary for why the rest only fill gaps instead of a full re-check.
export const ACHIEVEMENT_REFRESH_RECENT_COUNT = 20;
export const CHUNK = 200;
// /api/metacritic caps at 200 appids/request; a batch this size is fine now that it's cached
// server-side (most of a chunk resolves from cache instantly - only genuine cache misses hit the
// slow/fragile live-fetch path, which the route itself caps separately at 20 per request).
export const META_CHUNK = 100;
// /api/lowestprice caps at 200 appids/request (its own limit), but a smaller chunk here keeps
// progress updates from arriving in one giant jump on huge wishlists.
export const LOWPRICE_CHUNK = 100;
export const WISHLIST_CACHE_KEY = "wishlist:cache";
export const LIBRARY_CACHE_KEY = "library:cache";
// One shared identity across both tabs - switching between 찜목록/라이브러리 stays on the same
// account instead of prompting for a separate ID64 per tab.
export const STEAM_ID_STORAGE_KEY = "steamid";
export const MANUAL_PLATFORM_LABELS: Record<ManualPlatform, string> = {
  steam: "Steam",
  epic: "Epic",
  stove: "STOVE",
  other: "기타",
};
export const MANUAL_PLATFORM_STORAGE_KEY = "library:manual";
export const MANUAL_GAMES_STORAGE_KEY = "library:manualGames";
// Manual entries have no Steam-tracked playtime, so without this they silently contribute
// nothing to genre levels/taste - letting the user type a rough estimate lets them opt in.
export const MANUAL_PLAYTIME_STORAGE_KEY = "library:manualPlaytime";
// syncFromServer's "prefer local over stale/empty server data" check only ever protects against
// a fully-empty server response - if the server still has a manual entry you just deleted (its
// pushSync hadn't landed, or silently failed), the server's manualGames/manualPlatform is still
// non-empty and unconditionally overwrites local, resurrecting the deletion. Tracks appids
// deleted on this device so any still-stale entry gets filtered back out of whatever the server
// returns, rather than trusting a plain non-empty-wins merge. Cleared for an appid the moment
// it's re-added locally, so re-adding the same game later isn't permanently blocked.
export const MANUAL_REMOVED_STORAGE_KEY = "library:manualRemoved";
// Steam store region (price currency + ITAD low) - a per-browser preference like the layout mode,
// deliberately not part of the cross-device sync blob.
export const COUNTRY_STORAGE_KEY = "country";
// Bump this whenever the Game shape changes - otherwise old cached entries silently keep
// missing the new fields forever, since "resume from cache" treats them as already loaded.
export const CACHE_VERSION = 13;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Fixed row slot for the virtualized list: the row content renders at ROW_HEIGHT - ROW_GAP,
// leaving ROW_GAP of empty space below it as the visual gap between rows.
export const ROW_HEIGHT = 146;
// Mobile's list row stacks the image above the info instead of side-by-side (readable at phone
// width), which needs a lot more vertical room than the desktop row.
export const MOBILE_ROW_HEIGHT = 250;
export const ROW_GAP = 10;
// Card view keeps only image + title + one line of context (playtime for library, price/release
// for wishlist) - a grid can't fit as much per item as the list row can, so it's deliberately thin.
export const CARD_MIN_WIDTH = 190;
export const CARD_NARROW_BREAKPOINT = 520;
export const CARD_ROW_HEIGHT = 168;
