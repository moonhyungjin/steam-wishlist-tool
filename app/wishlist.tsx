"use client";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Grid, List, type CellComponentProps, type RowComponentProps } from "react-window";
type Item = { appid: number; playtimeMinutes?: number; lastPlayedTimestamp?: number | null };
type View = "wishlist" | "library";
type Profile = { personaName: string | null; avatarUrl: string | null; profileUrl: string | null };
type Game = {
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
  price: string;
  initialPrice: string | null;
  priceValue: number | null;
  discountPercent: number;
  discountEndDate: string | null;
  discountEndTimestamp: number | null;
  reviewPositive: number | null;
  metacritic: number | null;
  koreanSupported: boolean;
  adultContent: boolean;
  isDemo: boolean;
};
// Placeholder for a manually-added game with no Steam match - every other field just means "no
// data available" rather than "really zero/false", since none of it was actually looked up.
function blankGame(appid: number, name: string): Game {
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
    price: "정보 없음",
    initialPrice: null,
    priceValue: null,
    discountPercent: 0,
    discountEndDate: null,
    discountEndTimestamp: null,
    reviewPositive: null,
    metacritic: null,
    koreanSupported: false,
    adultContent: false,
    isDemo: false,
  };
}
type SortKey =
  | "price-asc"
  | "review"
  | "metacritic"
  | "release-desc"
  | "discount-end-asc"
  | "playtime-desc"
  | "achievement-desc"
  | "name-asc"
  | "recommend-desc"
  | "last-played-desc";
const WISHLIST_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recommend-desc", label: "추천도 높은순" },
  { value: "price-asc", label: "가격 낮은순" },
  { value: "review", label: "긍정 비율 높은순" },
  { value: "metacritic", label: "메타크리틱 높은순" },
  { value: "release-desc", label: "출시일 최신순" },
  { value: "discount-end-asc", label: "할인 종료 임박순" },
];
// Review/Metacritic/release date aren't shown as badges in the library view (they're wishlist
// buying-decision signals), so sorting by them there would be judging games on numbers the user
// can't actually see - achievement % and playtime are what's visible in this view.
const LIBRARY_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "playtime-desc", label: "플레이타임 높은순" },
  { value: "last-played-desc", label: "최근 플레이한순" },
  { value: "achievement-desc", label: "업적 비율 높은순(미완성)" },
  { value: "name-asc", label: "이름순" },
];
// "planned" (미플레이) was dropped as a status: as a chip choice it means the same thing as no
// status at all (미분류), so it added a redundant button without adding information.
type PlayStatus = "playing" | "completed" | "incomplete" | "dropped" | "excluded";
const STATUS_LABELS: Record<PlayStatus, string> = {
  playing: "플레이중",
  completed: "완료",
  incomplete: "보류",
  dropped: "하차",
  excluded: "제외",
};
const STATUS_ORDER: PlayStatus[] = ["playing", "completed", "incomplete", "dropped", "excluded"];
// Same tokens as the app's existing good/mid/bad score coloring (scoreClass) - a completed game
// reads as "good" the same way a high review score does, dropped as "bad", etc. '제외' stays
// muted since it isn't a judgment on the game, just an opt-out.
const STATUS_COLORS: Record<PlayStatus, string> = {
  playing: "#66c0f4",
  completed: "#6bd68a",
  incomplete: "#f5d06e",
  dropped: "#ef7a86",
  excluded: "#91a0b4",
};
const STATUS_STORAGE_KEY = "library:status";
type Rating = "like" | "dislike";
const RATING_EMOJI: Record<Rating, string> = { like: "👍", dislike: "👎" };
const RATING_LABELS: Record<Rating, string> = { like: "추천", dislike: "비추천" };
const RATING_STORAGE_KEY = "library:rating";
// "별점" - purely personal enjoyment, separate from whether I'd recommend it to someone else.
// Half-star increments (1~5, step 0.5).
type StarRating = 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;
const STAR_VALUES: StarRating[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const STAR_STORAGE_KEY = "library:stars";
// Genre level/taste/recommendation still need more real-world tuning before going live - this
// keeps every entry point (profile badge, popover, wishlist sort option, recommend chip) off in
// production while the underlying code, data model, and DB sync all ship as-is. Flip to true when
// ready to launch instead of re-threading these checks individually.
const GENRE_LEVELING_ENABLED = true;
// Deliberately much smaller than the genre *filter*'s GENRE_ALLOWLIST (100+ raw Steam tags) - that
// list is great for filtering (fine-grained facets are useful there) but terrible for leveling,
// since near-synonyms ("1인칭 슈팅"/"히어로 슈팅"/"익스트랙션 슈터") would each level up as their
// own separate, diluted bucket instead of one meaningful "슈팅" level. This list only has broad,
// non-overlapping top-level genres.
// Matched by Steam tagid, not name text - a display-name rename by Valve would otherwise
// silently break this allowlist without erroring anywhere. IDs resolved from a live snapshot
// of IStoreService/GetTagList (see app/steamTags.ts); names in the comments are just for
// readability when editing this list.
const GENRE_LEVEL_ALLOWLIST_IDS = new Set([
  19, // 액션
  21, // 어드벤처
  122, // RPG
  9, // 전략
  599, // 시뮬레이션
  701, // 스포츠
  699, // 레이싱
  597, // 캐주얼
  492, // 인디
  1664, // 퍼즐
  1625, // 플랫폼
  1774, // 슈팅
  1667, // 공포
  1662, // 생존
  1716, // 로그라이크
  1743, // 격투
  128, // MMO
  3810, // 샌드박스
  3799, // 비주얼 노벨
  1752, // 리듬
  1718, // MOBA
]);
// Quadratic RPG-style curve: level N needs N^2 * GENRE_XP_PER_LEVEL_SQ cumulative hours (5h/20h/
// 45h/80h/125h...) - cheap early levels, meaningfully harder later. Tune this one constant to
// retune the whole curve.
const GENRE_XP_PER_LEVEL_SQ = 5;
// A genre only enters the taste profile once it's shown up in at least this many owned games -
// below that, one 5-star fluke or one dropped game would swing the average wildly on pure noise.
const TASTE_MIN_GAMES = 12;
// The whole genre-level badge/popover stays hidden until the library has at least this much real
// signal - both floors have to clear, not just one, so neither "one 10-hour game" nor "50 games
// played for 5 minutes each" is enough on its own to call it a "profile."
const GENRE_LEVELS_MIN_GAMES = 5;
const GENRE_LEVELS_MIN_HOURS = 10;
// The diverging taste chart's fixed +/-domain, in percentage points off the recentered baseline
// (see genreTaste's comment on personalAvg) - kept as a fixed domain rather than scaled to
// each render's own min/max so the same score always draws the same bar length regardless of
// what else is in the library that day. 60 is sized off real post-recentering data (one real
// account's spread topped out around -48%/+20%, well within it) rather than gameAffinity()'s
// theoretical extremes, which would only be reached by a library with nothing but perfectly
// consistent 5-star-completed or 0.5-star-dropped games in a genre - not a realistic case worth
// sizing the chart around.
const TASTE_PCT_DOMAIN = 60;
// How much a single game's hours count toward its genres' taste score, relative to the 1.0
// baseline "just average" case - deliberately separate from GENRE_XP_PER_LEVEL_SQ's pure-hours
// level curve, since this is about how much the player *liked* the time spent, not how much they
// spent. Tune independently as real data comes in.
function gameAffinity(
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
type AchievementInfo = { achieved: number; total: number; percent: number };
const ACHIEVEMENT_STORAGE_KEY = "library:achievements";
const ACHIEVEMENT_CHUNK = 40;
const CHUNK = 200;
const META_CHUNK = 20;
const WISHLIST_CACHE_KEY = "wishlist:cache";
const LIBRARY_CACHE_KEY = "library:cache";
const API_KEY_STORAGE_KEY = "steam:apikey";
// Wishlist and library are independent identities (someone might track a friend's wishlist
// alongside their own library), so each tab keeps its own ID64 rather than sharing one.
const WL_STEAM_ID_STORAGE_KEY = "wishlist:steamid";
const LIB_STEAM_ID_STORAGE_KEY = "library:steamid";
// Games bought outside Steam (Epic, STOVE, ...) with no API to pull from - added by hand, matched
// by name against Steam's public search purely for metadata (image/genres/metacritic), completely
// unrelated to whether this Steam account actually owns them. Kept in their own storage key, apart
// from the Steam-fetched library cache, so a library refresh never wipes them.
type ManualPlatform = "epic" | "stove" | "other";
const MANUAL_PLATFORM_LABELS: Record<ManualPlatform, string> = {
  epic: "Epic",
  stove: "STOVE",
  other: "기타",
};
const MANUAL_PLATFORM_STORAGE_KEY = "library:manual";
const MANUAL_GAMES_STORAGE_KEY = "library:manualGames";
// Manual entries have no Steam-tracked playtime, so without this they silently contribute
// nothing to genre levels/taste - letting the user type a rough estimate lets them opt in.
const MANUAL_PLAYTIME_STORAGE_KEY = "library:manualPlaytime";
// Bump this whenever the Game shape changes - otherwise old cached entries silently keep
// missing the new fields forever, since "resume from cache" treats them as already loaded.
const CACHE_VERSION = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Fixed row slot for the virtualized list: the row content renders at ROW_HEIGHT - ROW_GAP,
// leaving ROW_GAP of empty space below it as the visual gap between rows.
const ROW_HEIGHT = 146;
// Mobile's list row stacks the image above the info instead of side-by-side (readable at phone
// width), which needs a lot more vertical room than the desktop row.
const MOBILE_ROW_HEIGHT = 250;
const ROW_GAP = 10;
// Card view keeps only image + title + one line of context (playtime for library, price/release
// for wishlist) - a grid can't fit as much per item as the list row can, so it's deliberately thin.
const CARD_MIN_WIDTH = 190;
const CARD_ROW_HEIGHT = 168;
function scoreClass(n: number): string {
  return n >= 75 ? "good" : n >= 50 ? "mid" : "bad";
}
function genreLevelInfo(hours: number) {
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
function recommendScore(
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
function compareByKey(
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
function sortItems(
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
function prioritizeAchievementOrder(
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
const GENRE_FILTER_LIMIT = 40;
// Steam's community tags mix real genres/mechanics with aesthetic or subjective descriptors
// (귀여운, 여주인공, 2D, ...) that aren't useful as a filter facet and would otherwise crowd out
// actually-common genres by raw tag frequency. This curates the filter panel down to tags that
// describe genre or gameplay mechanics; the per-game tag line elsewhere is unaffected.
// Matched by tagid (see the GENRE_LEVEL_ALLOWLIST_IDS comment above) - names in comments are
// just for readability.
const GENRE_ALLOWLIST_IDS = new Set([
  9, // 전략
  19, // 액션
  21, // 어드벤처
  122, // RPG
  128, // MMO
  492, // 인디
  597, // 캐주얼
  599, // 시뮬레이션
  699, // 레이싱
  701, // 스포츠
  1625, // 플랫폼
  1628, // 메트로배니아
  1643, // 건설
  1645, // 타워 디펜스
  1646, // 핵 앤 슬래시
  1662, // 생존
  3978, // 생존 공포
  1663, // 1인칭 슈팅
  3814, // 3인칭 슈팅
  1664, // 퍼즐
  5537, // 퍼즐 플랫폼
  1665, // 매치 3
  1666, // 카드 게임
  9271, // 트레이딩 카드 게임
  1667, // 공포
  1721, // 심리적 공포
  1670, // 4X
  1676, // 실시간 전략
  3813, // 실시간 전술
  1677, // 턴제
  1741, // 턴제 전략
  14139, // 턴제 전술
  1684, // 판타지
  4604, // 다크 판타지
  1685, // 협동
  4508, // 협동 캠페인
  1687, // 잠입
  1695, // 오픈 월드
  1698, // 포인트 앤드 클릭
  1702, // 크래프팅
  1708, // 전술
  1716, // 로그라이크
  3959, // 로그라이트
  454187, // 정통 로그라이크
  1091588, // 로그라이크 덱빌딩
  1718, // MOBA
  1720, // 던전 크롤러
  1723, // 액션 RTS
  1730, // 창고지기
  1743, // 격투
  4736, // 2D 격투
  6506, // 3D 격투
  1752, // 리듬
  1754, // MMORPG
  1770, // 보드게임
  1773, // 아케이드
  1774, // 슈팅
  4637, // 탑다운 슈팅
  1023537, // 부머 슈팅
  3799, // 비주얼 노벨
  3810, // 샌드박스
  3942, // 공상과학
  3993, // 전투
  4106, // 액션 어드벤처
  4115, // 사이버펑크
  4231, // 액션 RPG
  4328, // 도시 건설
  4434, // JRPG
  4474, // CRPG
  4520, // 파밍
  87918, // 농장 시뮬레이션
  4684, // 전쟁 게임
  4695, // 경제
  12472, // 경영
  16689, // 시간 관리
  10235, // 생활 시뮬레이션
  9551, // 연애 시뮬레이션
  5900, // 걷기 시뮬레이션
  35079, // 직업 시뮬레이션
  16598, // 우주 시뮬레이션
  26921, // 정치 시뮬레이션
  22602, // 농업
  32322, // 덱빌딩
  176981, // 배틀 로얄
  29482, // 소울라이크
  31275, // 텍스트 기반
  17305, // 전략 RPG
  21725, // 전술 RPG
  25959, // 무협
  21978, // VR
  7108, // 파티
  7178, // 파티 게임
  5752, // 로봇
  1659, // 좀비
  1674, // 타자
  11104, // 차량 전투
  8122, // 레벨 에디터
  25085, // 터치 친화적
  620519, // 히어로 슈팅
  1199779, // 익스트랙션 슈터
  5547, // 아레나 슈팅
]);
function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
// Tries the Steam client's own library page first (steam:// URIs have no "is this installed"
// API to check ahead of time), and falls back to the web store page if nothing takes over the
// tab shortly after - the classic custom-protocol-link pattern: a successful handoff to another
// app typically blurs the browser window, so no blur within the timeout means it didn't work.
function openLibraryOrStore(appid: number) {
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
function StatusGlyph({ status }: { status: PlayStatus }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={status === "playing" || status === "incomplete" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {status === "playing" && <polygon points="6,4 20,12 6,20" />}
      {status === "completed" && <path d="M20 6L9 17l-5-5" />}
      {status === "incomplete" && (
        <>
          <rect x="6" y="4" width="4" height="16" stroke="none" />
          <rect x="14" y="4" width="4" height="16" stroke="none" />
        </>
      )}
      {status === "dropped" && (
        <>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </>
      )}
      {status === "excluded" && (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
}
// One glyph per GENRE_LEVEL_ALLOWLIST_IDS entry (same "switch on the enum value" shape as
// StatusGlyph above) - sized via CSS class rather than a size prop, same reasoning as StarGlyph:
// this renders at a different size in the profile badge vs. a chart row, and a shared base class
// plus a per-context size class is less plumbing than threading a size prop through both call
// sites. Every call site is already scoped to the 21-entry allowlist, so an unmatched id
// shouldn't occur in practice; returns null rather than inventing a generic fallback shape.
function GenreGlyph({ genreId, className }: { genreId: number; className?: string }) {
  switch (genreId) {
    case 19: // 액션
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="13,2 4,14 11,14 9,22 20,9 12,9" />
        </svg>
      );
    case 21: // 어드벤처
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <polygon points="15,9 13,13 9,15 11,11" />
        </svg>
      );
    case 122: // RPG
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z" />
        </svg>
      );
    case 9: // 전략
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
        </svg>
      );
    case 599: // 시뮬레이션
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
      );
    case 701: // 스포츠
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18M5.5 5.5c3 3 3 10 0 13M18.5 5.5c-3 3-3 10 0 13" />
        </svg>
      );
    case 699: // 레이싱
      return (
        <svg className={className} viewBox="0 0 24 24">
          <line
            x1="5"
            y1="3"
            x2="5"
            y2="21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M5 4l7 3-7 3z" fill="currentColor" />
        </svg>
      );
    case 597: // 캐주얼
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
          <path d="M8 15c1.5 1.5 6.5 1.5 8 0" />
        </svg>
      );
    case 492: // 인디
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12,2 15,12 12,22 9,12" />
        </svg>
      );
    case 1664: // 퍼즐
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M4 4h6a2 2 0 1 1 4 0h6v6a2 2 0 1 1 0 4v6h-6a2 2 0 1 1-4 0H4v-6a2 2 0 1 0 0-4z" />
        </svg>
      );
    case 1625: // 플랫폼
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="6" cy="4" r="1.6" fill="currentColor" stroke="none" />
          <line x1="4" y1="8" x2="10" y2="8" />
          <line x1="14" y1="14" x2="20" y2="14" />
          <line x1="6" y1="20" x2="12" y2="20" />
        </svg>
      );
    case 1774: // 슈팅
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      );
    case 1667: // 공포
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a7 7 0 0 0-7 7v9l2-2 2 2 2-2 2 2 2-2 2 2 2-2V10a7 7 0 0 0-7-7z" />
          <circle cx="9.5" cy="10" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="10" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 1662: // 생존
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21c-4 0-6-3-6-6 0-3 2-5 3-8 0 2 1 3 2 3 0-3 1-5 3-7 1 3 3 5 3 9 0 4-1 9-5 9z" />
        </svg>
      );
    case 1716: // 로그라이크
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 1743: // 격투
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 11V7a2 2 0 1 1 4 0M12 11V6a2 2 0 1 1 4 0M16 11V7a2 2 0 1 1 4 0v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-2a2 2 0 1 1 4 0" />
        </svg>
      );
    case 128: // MMO
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="6" cy="7" r="2.2" />
          <circle cx="18" cy="7" r="2.2" />
          <circle cx="12" cy="17" r="2.2" />
          <line x1="7.8" y1="8.5" x2="10.5" y2="15" />
          <line x1="16.2" y1="8.5" x2="13.5" y2="15" />
          <line x1="8.2" y1="7" x2="15.8" y2="7" />
        </svg>
      );
    case 3810: // 샌드박스
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M4 7.5L12 12l8-4.5M12 12v9" />
        </svg>
      );
    case 3799: // 비주얼 노벨
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M4 5c3-1.5 6-1.5 8 0v14c-2-1.5-5-1.5-8 0z" />
          <path d="M20 5c-3-1.5-6-1.5-8 0v14c2-1.5 5-1.5 8 0z" />
        </svg>
      );
    case 1752: // 리듬
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="18" r="2.2" fill="currentColor" stroke="none" />
          <circle cx="17" cy="16" r="2.2" fill="currentColor" stroke="none" />
          <path d="M9.2 18V5l9.8-2v11" />
        </svg>
      );
    case 1718: // MOBA
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="20" x2="17" y2="7" />
          <line x1="20" y1="20" x2="7" y2="7" />
          <polyline points="14,4 17,4 17,7" />
          <polyline points="10,4 7,4 7,7" />
        </svg>
      );
    default:
      return null;
  }
}
// The taste tab's fine-grained genres (GENRE_ALLOWLIST_IDS, up to 101) don't each get their own
// icon - most are near-duplicates of a GENRE_LEVEL_ALLOWLIST_IDS entry (턴제 전략/실시간 전략/4X
// all read as "전략") and hand-drawing 80 more one-off glyphs isn't worth it for a decorative
// touch. This maps every non-self id to whichever of the 21 broad genres is the closest
// conceptual parent, so GenreGlyph(GENRE_ICON_PARENT[id] ?? id) resolves for the whole fine-grained
// set - a judgment call, not a taxonomy, so a few of these are debatable either way.
const GENRE_ICON_PARENT: Record<number, number> = {
  1628: 1625, // 메트로배니아 -> 플랫폼
  1643: 599, // 건설 -> 시뮬레이션
  1645: 9, // 타워 디펜스 -> 전략
  1646: 19, // 핵 앤 슬래시 -> 액션
  3978: 1667, // 생존 공포 -> 공포
  1663: 1774, // 1인칭 슈팅 -> 슈팅
  3814: 1774, // 3인칭 슈팅 -> 슈팅
  5537: 1664, // 퍼즐 플랫폼 -> 퍼즐
  1665: 1664, // 매치 3 -> 퍼즐
  1666: 9, // 카드 게임 -> 전략
  9271: 9, // 트레이딩 카드 게임 -> 전략
  1721: 1667, // 심리적 공포 -> 공포
  1670: 9, // 4X -> 전략
  1676: 9, // 실시간 전략 -> 전략
  3813: 9, // 실시간 전술 -> 전략
  1677: 9, // 턴제 -> 전략
  1741: 9, // 턴제 전략 -> 전략
  14139: 9, // 턴제 전술 -> 전략
  1684: 122, // 판타지 -> RPG
  4604: 122, // 다크 판타지 -> RPG
  1685: 19, // 협동 -> 액션
  4508: 19, // 협동 캠페인 -> 액션
  1687: 19, // 잠입 -> 액션
  1695: 21, // 오픈 월드 -> 어드벤처
  1698: 21, // 포인트 앤드 클릭 -> 어드벤처
  1702: 599, // 크래프팅 -> 시뮬레이션
  1708: 9, // 전술 -> 전략
  3959: 1716, // 로그라이트 -> 로그라이크
  454187: 1716, // 정통 로그라이크 -> 로그라이크
  1091588: 1716, // 로그라이크 덱빌딩 -> 로그라이크
  1720: 122, // 던전 크롤러 -> RPG
  1723: 19, // 액션 RTS -> 액션
  1730: 1664, // 창고지기 -> 퍼즐
  4736: 1743, // 2D 격투 -> 격투
  6506: 1743, // 3D 격투 -> 격투
  1754: 128, // MMORPG -> MMO
  1770: 9, // 보드게임 -> 전략
  1773: 19, // 아케이드 -> 액션
  4637: 1774, // 탑다운 슈팅 -> 슈팅
  1023537: 1774, // 부머 슈팅 -> 슈팅
  3942: 21, // 공상과학 -> 어드벤처
  3993: 19, // 전투 -> 액션
  4106: 19, // 액션 어드벤처 -> 액션
  4115: 21, // 사이버펑크 -> 어드벤처
  4231: 122, // 액션 RPG -> RPG
  4328: 599, // 도시 건설 -> 시뮬레이션
  4434: 122, // JRPG -> RPG
  4474: 122, // CRPG -> RPG
  4520: 599, // 파밍 -> 시뮬레이션
  87918: 599, // 농장 시뮬레이션 -> 시뮬레이션
  4684: 9, // 전쟁 게임 -> 전략
  4695: 599, // 경제 -> 시뮬레이션
  12472: 599, // 경영 -> 시뮬레이션
  16689: 599, // 시간 관리 -> 시뮬레이션
  10235: 599, // 생활 시뮬레이션 -> 시뮬레이션
  9551: 599, // 연애 시뮬레이션 -> 시뮬레이션
  5900: 21, // 걷기 시뮬레이션 -> 어드벤처
  35079: 599, // 직업 시뮬레이션 -> 시뮬레이션
  16598: 599, // 우주 시뮬레이션 -> 시뮬레이션
  26921: 599, // 정치 시뮬레이션 -> 시뮬레이션
  22602: 599, // 농업 -> 시뮬레이션
  32322: 9, // 덱빌딩 -> 전략
  176981: 19, // 배틀 로얄 -> 액션
  29482: 122, // 소울라이크 -> RPG
  31275: 21, // 텍스트 기반 -> 어드벤처
  17305: 9, // 전략 RPG -> 전략
  21725: 9, // 전술 RPG -> 전략
  25959: 1743, // 무협 -> 격투
  21978: 19, // VR -> 액션
  7108: 597, // 파티 -> 캐주얼
  7178: 597, // 파티 게임 -> 캐주얼
  5752: 19, // 로봇 -> 액션
  1659: 1667, // 좀비 -> 공포
  1674: 1664, // 타자 -> 퍼즐
  11104: 699, // 차량 전투 -> 레이싱
  8122: 599, // 레벨 에디터 -> 시뮬레이션
  25085: 597, // 터치 친화적 -> 캐주얼
  620519: 1774, // 히어로 슈팅 -> 슈팅
  1199779: 1774, // 익스트랙션 슈터 -> 슈팅
  5547: 1774, // 아레나 슈팅 -> 슈팅
};
// Compact spider/radar chart - up to N genres as axes (angle = index, radius = value / the
// largest value shown), so it reads as "shape of my play" rather than absolute magnitude (the
// bar list below it already covers that). Points/rings/spokes are computed with plain trig
// rather than baked into fixed paths, since the axis count and each value varies per library.
function GenreRadar({ entries }: { entries: { genreId: number; genre: string; value: number }[] }) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const r = 84;
  const n = entries.length;
  if (n < 3) return null;
  const maxValue = Math.max(...entries.map((e) => e.value), 1);
  const angleFor = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pointAt = (i: number, frac: number) => {
    const a = angleFor(i);
    return { x: cx + r * frac * Math.cos(a), y: cy + r * frac * Math.sin(a) };
  };
  const dataPath = entries
    .map((e, i) => {
      const p = pointAt(i, e.value / maxValue);
      return `${p.x},${p.y}`;
    })
    .join(" ");
  return (
    <svg className="genreRadar" viewBox={`0 0 ${size} ${size}`}>
      {[0.33, 0.66, 1].map((ring) => (
        <polygon
          key={ring}
          className="radarRing"
          points={entries
            .map((_, i) => {
              const p = pointAt(i, ring);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
        />
      ))}
      {entries.map((e, i) => {
        const p = pointAt(i, 1);
        return <line key={e.genreId} className="radarSpoke" x1={cx} y1={cy} x2={p.x} y2={p.y} />;
      })}
      <polygon className="radarShape" points={dataPath} />
      {entries.map((e, i) => {
        const p = pointAt(i, 1.2);
        const cosA = Math.cos(angleFor(i));
        const anchor = cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";
        return (
          <text
            key={e.genreId}
            className="radarLabel"
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {e.genre}
          </text>
        );
      })}
    </svg>
  );
}
// A plumper star polygon (inner/outer radius ratio ~0.5, vs. the classic ~0.38) traced with a
// round-joined stroke in the same color as the fill - that combination is what rounds off both the
// outer points and the inner notches, instead of the sharp glyph a plain "★" character gives.
function StarGlyph() {
  return (
    <svg
      className="starGlyph"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <polygon points="12,2 14.94,7.96 21.51,8.91 16.76,13.55 17.88,20.09 12,17 6.12,20.09 7.25,13.55 2.49,8.91 9.06,7.96" />
    </svg>
  );
}
// Read-only 5-star row (same bg/fg overlay trick as StarPicker, minus the click handling) - used
// wherever a half-star value needs to read as an actual star rating instead of a bare number.
function StarRow({ value }: { value: number }) {
  return (
    <span className="starRowDisplay">
      {[1, 2, 3, 4, 5].map((i) => {
        const fillPct = value >= i ? 100 : value >= i - 0.5 ? 50 : 0;
        return (
          <span key={i} className="starRowIcon">
            <span className="starBg">
              <StarGlyph />
            </span>
            <span className="starFg" style={{ width: `${fillPct}%` }}>
              <StarGlyph />
            </span>
          </span>
        );
      })}
    </span>
  );
}
// Half-star picker: each of the 5 positions is a button with two overlaid glyphs (a dim background
// star, and a gold foreground star clipped to 0/50/100% width) - clicking the left vs right half of
// a button picks the half-star vs full-star value for that position. Hover previews the pick before
// committing, same as any star-rating widget.
function StarPicker({
  value,
  onChange,
}: {
  value: StarRating | undefined;
  onChange: (v: StarRating | null) => void;
}) {
  const [hover, setHover] = useState<StarRating | null>(null);
  const display = hover ?? value ?? 0;
  function pickFromEvent(e: { currentTarget: HTMLButtonElement; clientX: number }, i: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    return (leftHalf ? i - 0.5 : i) as StarRating;
  }
  return (
    <span className="starPicker" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fillPct = display >= i ? 100 : display >= i - 0.5 ? 50 : 0;
        return (
          <button
            key={i}
            type="button"
            className="starBtn"
            onMouseMove={(e) => setHover(pickFromEvent(e, i))}
            onClick={(e) => {
              const picked = pickFromEvent(e, i);
              onChange(value === picked ? null : picked);
            }}
          >
            <span className="starBg">
              <StarGlyph />
            </span>
            <span className="starFg" style={{ width: `${fillPct}%` }}>
              <StarGlyph />
            </span>
          </button>
        );
      })}
    </span>
  );
}
function GameRow({
  index,
  style,
  items,
  games,
  view,
  statusMap,
  onSetStatus,
  ratingMap,
  onSetRating,
  starMap,
  onSetStar,
  achievementMap,
  checkingAchievements,
  onCheckAchievement,
  rowHeight,
  manualPlatform,
  onRemoveManual,
  onSetManualPlaytime,
  recommendPercentile,
  sortKey,
  steamId,
}: RowComponentProps<{
  items: Item[];
  games: Record<number, Game>;
  view: View;
  statusMap: Record<number, PlayStatus>;
  onSetStatus: (appid: number, status: PlayStatus | null) => void;
  ratingMap: Record<number, Rating>;
  onSetRating: (appid: number, rating: Rating | null) => void;
  starMap: Record<number, StarRating>;
  onSetStar: (appid: number, star: StarRating | null) => void;
  achievementMap: Record<number, AchievementInfo | null>;
  checkingAchievements: Set<number>;
  onCheckAchievement: (appid: number) => void;
  rowHeight: number;
  manualPlatform: Record<number, ManualPlatform>;
  steamId: string;
  onRemoveManual: (appid: number) => void;
  onSetManualPlaytime: (appid: number, hours: number | null) => void;
  recommendPercentile: Record<number, number>;
  sortKey: SortKey | null;
}>) {
  const item = items[index];
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  const star = starMap[item.appid];
  const starPopoverRef = useRef<HTMLDivElement>(null);
  const statusPopoverRef = useRef<HTMLDivElement>(null);
  const [editingPlaytime, setEditingPlaytime] = useState(false);
  const achievement = achievementMap[item.appid];
  const checkingAchievement = checkingAchievements.has(item.appid);
  const recommend =
    GENRE_LEVELING_ENABLED && view === "wishlist" && sortKey === "recommend-desc"
      ? (recommendPercentile[item.appid] ?? null)
      : null;
  // Negative appids are synthetic (no Steam match), so there's no real store/library page to link
  // to - everything else about a manual entry behaves the same either way.
  const manual = manualPlatform[item.appid];
  const linkable = item.appid > 0;
  // A manual entry is never actually owned in this account's library even when it matched a real
  // Steam appid, so the steam:// launch-the-installed-client attempt would just burn its timeout
  // for nothing - go straight to the store page instead.
  const tryLibrary = view === "library" && !manual;
  return (
    <article className="game" style={{ ...style, height: rowHeight - ROW_GAP }}>
      <div className="coverWrap">
        {linkable ? (
          <a
            className="cover"
            href={`https://store.steampowered.com/app/${item.appid}`}
            target="_blank"
            rel="noopener noreferrer"
            title={
              tryLibrary
                ? "Steam 라이브러리에서 열기 (Steam 미설치 시 상점 페이지)"
                : "스팀 상점 페이지 열기"
            }
            onClick={(e) => {
              if (!tryLibrary || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              openLibraryOrStore(item.appid);
            }}
          >
            {g?.headerImage ? (
              <img src={g.headerImage} alt="" loading="lazy" decoding="async" />
            ) : (
              <div className="loadingCover">LOADING</div>
            )}
          </a>
        ) : (
          <div className="cover">
            <div className="loadingCover">이미지 없음</div>
          </div>
        )}
      </div>
      <div className="info">
        <div className="titleRow">
          <h3>
            {linkable ? (
              <a
                className="storeLink"
                href={`https://store.steampowered.com/app/${item.appid}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!tryLibrary || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  openLibraryOrStore(item.appid);
                }}
                title={
                  tryLibrary
                    ? "Steam 라이브러리에서 열기 (Steam 미설치 시 상점 페이지)"
                    : "스팀 상점 페이지 열기"
                }
              >
                <span className="storeLinkText">{g?.name ?? `Steam App ${item.appid}`}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </a>
            ) : (
              <span className="storeLink" style={{ color: "var(--text)" }}>
                <span className="storeLinkText">{g?.name ?? `Steam App ${item.appid}`}</span>
              </span>
            )}
          </h3>
          {view === "library" && status !== "excluded" && (
            <>
              <button
                type="button"
                className={"titleStarPicker" + (star == null ? " unset" : "")}
                popoverTarget={`star-popover-${item.appid}`}
                title="내 별점 (재미/만족도)"
              >
                <StarGlyph />
                {star != null ? star : "평가 없음"}
              </button>
              <div
                popover="auto"
                id={`star-popover-${item.appid}`}
                className="starPopover"
                ref={starPopoverRef}
              >
                <StarPicker
                  value={star}
                  onChange={(v) => {
                    onSetStar(item.appid, v);
                    starPopoverRef.current?.hidePopover();
                  }}
                />
                {/* StarPicker itself only clears when you tap the exact same half-star spot
                    again, which isn't discoverable on a touch popover with no hover preview -
                    give mobile an explicit clear action. */}
                <button
                  type="button"
                  className="starClearBtn"
                  onClick={() => {
                    onSetStar(item.appid, null);
                    starPopoverRef.current?.hidePopover();
                  }}
                >
                  미평가로 초기화
                </button>
              </div>
            </>
          )}
          {recommend != null && (
            <span
              className="chip recommendTag"
              title="위시리스트 안에서의 취향 매치 순위 - 100이면 위시리스트 전체 중 최고 매치 (실험적 기능)"
            >
              ✨ 추천 {recommend}%
            </span>
          )}
        </div>
        <p className="meta">{g?.genres.slice(0, 3).join(" · ") || "게임 정보 불러오는 중"}</p>
        <div className="badges">
          {manual ? (
            editingPlaytime ? (
              <span className="chip playtimeEdit">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  autoFocus
                  defaultValue={item.playtimeMinutes ? item.playtimeMinutes / 60 : ""}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseFloat(e.currentTarget.value);
                      onSetManualPlaytime(item.appid, Number.isFinite(v) ? v : null);
                      setEditingPlaytime(false);
                    } else if (e.key === "Escape") {
                      setEditingPlaytime(false);
                    }
                  }}
                  onBlur={(e) => {
                    const v = parseFloat(e.currentTarget.value);
                    onSetManualPlaytime(item.appid, Number.isFinite(v) ? v : null);
                    setEditingPlaytime(false);
                  }}
                />
                시간
              </span>
            ) : (
              <button
                type="button"
                className="chip playtimeChip"
                onClick={() => setEditingPlaytime(true)}
                title="직접 입력한 플레이타임 - 장르 레벨/선호도 계산에 반영됩니다"
              >
                {item.playtimeMinutes != null
                  ? `플레이타임 ${(item.playtimeMinutes / 60).toFixed(1)}시간 (수정)`
                  : "플레이타임 입력"}
              </button>
            )
          ) : item.playtimeMinutes != null ? (
            <span className="chip">플레이타임 {(item.playtimeMinutes / 60).toFixed(1)}시간</span>
          ) : null}
          {manual && (
            <span className="chip manual">
              {MANUAL_PLATFORM_LABELS[manual]}
              <button
                type="button"
                className="manualRemoveBtn"
                onClick={() => onRemoveManual(item.appid)}
                title="목록에서 제거"
              >
                ×
              </button>
            </span>
          )}
          {view === "wishlist" && g?.price && <span className="chip">{g.price}</span>}
          {view === "wishlist" && g?.discountPercent ? (
            <a
              className="chip discount"
              href={`https://steamdb.info/app/${item.appid}/`}
              target="_blank"
              rel="noopener noreferrer"
              title="SteamDB에서 가격 기록 보기"
              onClick={(e) => e.stopPropagation()}
            >
              -{g.discountPercent}%
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </a>
          ) : null}
          {view === "wishlist" && g?.metacritic != null ? (
            <span className={"chip " + scoreClass(g.metacritic)} title="Metacritic 점수">
              메타 {g.metacritic}
            </span>
          ) : null}
          {view === "wishlist" && g?.reviewPositive ? (
            <span className={"chip " + scoreClass(g.reviewPositive)} title="Steam 리뷰 긍정 비율">
              리뷰 {g.reviewPositive}%
            </span>
          ) : null}
          {achievement != null && achievement.achieved > 0 ? (
            <a
              className={"chip " + scoreClass(achievement.percent)}
              href={`https://steamcommunity.com/profiles/${steamId}/stats/${item.appid}/achievements`}
              target="_blank"
              rel="noopener noreferrer"
              title="Steam에서 업적 목록 보기"
            >
              업적 {achievement.percent}% ({achievement.achieved}/{achievement.total})
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </a>
          ) : view === "library" && achievement === undefined && !manual ? (
            <button
              type="button"
              className="chip pending"
              disabled={checkingAchievement}
              onClick={() => onCheckAchievement(item.appid)}
              title="클릭하면 이 게임의 업적을 바로 확인합니다"
            >
              {checkingAchievement ? "업적 확인 중..." : "업적 확인중 (클릭)"}
            </button>
          ) : null}
          {g && !g.koreanSupported ? (
            <span
              className="chip bad"
              title="인터페이스/자막/더빙 중 하나라도 한국어를 지원하는지 여부"
            >
              한국어 미지원
            </span>
          ) : null}
          {g?.comingSoon ? (
            <span className="chip">{g.releaseUnannounced ? "출시 미정" : "출시 예정"}</span>
          ) : null}
        </div>
        {view === "wishlist" && (g?.releaseDate || g?.discountEndDate) ? (
          <p className="meta">
            {g.releaseDate && <>출시일 {g.releaseDate}</>}
            {g.releaseDate && g.discountEndDate && " · "}
            {g.discountEndDate && <>할인 종료일 {g.discountEndDate}</>}
          </p>
        ) : null}
        {view === "library" ? (
          <div className="statusRow">
            <button
              type="button"
              className={"statusPicker" + (status == null ? " unset" : "")}
              popoverTarget={`status-popover-${item.appid}`}
              title="진행 상태"
              style={status ? { color: STATUS_COLORS[status] } : undefined}
            >
              {status && <StatusGlyph status={status} />}
              {status ? STATUS_LABELS[status] : "상태 없음"}
            </button>
            <div
              popover="auto"
              id={`status-popover-${item.appid}`}
              className="statusPopover"
              ref={statusPopoverRef}
            >
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={"statusOption " + (status === s ? "active" : "")}
                  style={{
                    color: STATUS_COLORS[s],
                    ...(status === s
                      ? { background: STATUS_COLORS[s] + "29", borderColor: STATUS_COLORS[s] }
                      : {}),
                  }}
                  onClick={() => {
                    onSetStatus(item.appid, status === s ? null : s);
                    statusPopoverRef.current?.hidePopover();
                  }}
                >
                  <StatusGlyph status={s} />
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {status !== "excluded" && (
              <span className="ratingChips">
                {(["like", "dislike"] as const)
                  .filter((r) => !rating || rating === r)
                  .map((r) => (
                    <button
                      key={r}
                      className={"ratingChip " + (rating === r ? "active" : "")}
                      title={RATING_LABELS[r]}
                      onClick={() => onSetRating(item.appid, rating === r ? null : r)}
                    >
                      {RATING_EMOJI[r]}
                    </button>
                  ))}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
function CardCell({
  columnIndex,
  rowIndex,
  style,
  items,
  games,
  view,
  columnCount,
  statusMap,
  ratingMap,
  starMap,
  manualPlatform,
  onRemoveManual,
}: CellComponentProps<{
  items: Item[];
  games: Record<number, Game>;
  view: View;
  columnCount: number;
  statusMap: Record<number, PlayStatus>;
  ratingMap: Record<number, Rating>;
  starMap: Record<number, StarRating>;
  manualPlatform: Record<number, ManualPlatform>;
  onRemoveManual: (appid: number) => void;
}>) {
  const index = rowIndex * columnCount + columnIndex;
  const item = items[index];
  if (!item) return <div style={style} />;
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  const star = starMap[item.appid];
  const manual = manualPlatform[item.appid];
  const linkable = item.appid > 0;
  const cardContent = (
    <>
      <div className="cardCover">
        {g?.headerImage ? (
          <img src={g.headerImage} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="loadingCover">{linkable ? "LOADING" : "이미지 없음"}</div>
        )}
        {view === "wishlist" && (g?.metacritic != null || g?.reviewPositive) ? (
          <div className="cardBadges cardBadgesBottomRight">
            {g.metacritic != null ? (
              <span className={"cardBadge " + scoreClass(g.metacritic)}>메타 {g.metacritic}</span>
            ) : null}
            {g.reviewPositive ? (
              <span className={"cardBadge " + scoreClass(g.reviewPositive)}>
                리뷰 {g.reviewPositive}%
              </span>
            ) : null}
          </div>
        ) : null}
        {view === "library" && manual ? (
          <div className="cardBadges">
            <span className="cardBadge manual">
              {/* The only clickable thing in this overlay - stopped from bubbling up into the
                  whole-card link, which would otherwise also navigate away on click. */}
              {MANUAL_PLATFORM_LABELS[manual]}
              <button
                type="button"
                className="manualRemoveBtn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveManual(item.appid);
                }}
                title="목록에서 제거"
              >
                ×
              </button>
            </span>
          </div>
        ) : null}
        {view === "library" && (status || star || rating) ? (
          <div className="cardBadges cardBadgesBottomRight">
            {status && (
              <span className="cardBadge status" style={{ color: STATUS_COLORS[status] }}>
                <StatusGlyph status={status} />
                {STATUS_LABELS[status]}
              </span>
            )}
            {status !== "excluded" && star && (
              <span className="cardBadge stars">
                <StarGlyph />
                {star}
              </span>
            )}
            {status !== "excluded" && rating && (
              <span className="cardBadge">{RATING_EMOJI[rating]}</span>
            )}
          </div>
        ) : null}
      </div>
      <div className="cardInfo">
        <h4>{g?.name ?? `Steam App ${item.appid}`}</h4>
        {view === "library"
          ? item.playtimeMinutes != null && (
              <p className="cardMeta">{(item.playtimeMinutes / 60).toFixed(1)}시간</p>
            )
          : g?.price && (
              <p className="cardMeta">
                {g.price}
                {g.discountPercent ? ` (-${g.discountPercent}%)` : ""}
              </p>
            )}
      </div>
    </>
  );
  return (
    <div style={style} className="cardCellOuter">
      {linkable ? (
        <a
          className="card"
          href={`https://store.steampowered.com/app/${item.appid}`}
          target="_blank"
          rel="noopener noreferrer"
          title={g?.name ?? `Steam App ${item.appid}`}
        >
          {cardContent}
        </a>
      ) : (
        <div className="card">{cardContent}</div>
      )}
    </div>
  );
}
function FilterGroup({
  title,
  collapsed,
  onToggle,
  activeCount,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  // Shown as a small badge next to the title so a collapsed group's active filters are still
  // visible at a glance, instead of only finding out by expanding every group in turn.
  activeCount?: number;
  children: ReactNode;
}) {
  return (
    <div className="filterGroup">
      <div className="sortLabel fieldToggle" onClick={onToggle}>
        {title}
        {!!activeCount && <span className="filterActiveBadge">{activeCount}</span>}
        <span className={"fieldChevron" + (collapsed ? "" : " open")} />
      </div>
      {!collapsed && <div className="checkList">{children}</div>}
    </div>
  );
}
// Split out from Wishlist so typing in the search box only re-renders this small panel instead of
// the entire app - manualQuery lived in Wishlist's own state before, and every keystroke was
// re-rendering the whole sidebar (every FilterGroup) plus the virtualized list/grid's rowProps/
// cellProps (fresh object each render, so react-window couldn't skip re-rendering visible rows
// either), which is exactly why typing felt laggy despite the input itself doing very little.
function ManualAddPanel({
  onAdd,
  onClose,
}: {
  onAdd: (appid: number, platform: ManualPlatform, game: Game) => void;
  onClose: () => void;
}) {
  const [manualQuery, setManualQuery] = useState("");
  const [manualPlatformChoice, setManualPlatformChoice] = useState<ManualPlatform>("epic");
  const [manualResults, setManualResults] = useState<
    { appid: number; name: string; image: string | null; isDlc?: boolean }[]
  >([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualAdding, setManualAdding] = useState(false);
  // Brief "✓ 추가됨" confirmation so rapid-fire adds (the panel no longer closes on add) still
  // feel confirmed - cleared by the timeout from the *next* add, or manually after 2s.
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  // Korean (and other IME) input fires onChange for every intermediate jamo composition state
  // ("ㅇ" -> "아" -> "안" -> ...), not just the finished syllable - without this, each of those
  // partial states could restart/fire the debounce below, searching for half-typed garbage.
  const [isComposing, setIsComposing] = useState(false);
  // Debounced live search - now that this panel is its own component (see the comment above
  // ManualAddPanel), typing here no longer re-renders the whole app, so the earlier "feels slow"
  // complaint was actually that re-render cost, not this. "검색 중" only turns on once the
  // debounce actually settles and the request goes out, not on every keystroke while still
  // typing, or it reads as searching immediately on each key instead of waiting you out. Skips
  // entirely while isComposing - see the comment on that state.
  useEffect(() => {
    if (isComposing) return;
    if (manualQuery.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManualResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setManualSearching(true);
      fetch(`/api/search-game?term=${encodeURIComponent(manualQuery.trim())}`)
        .then((r) => r.json())
        .then((d) => setManualResults(d.items ?? []))
        .catch(() => setManualResults([]))
        .finally(() => setManualSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [manualQuery, isComposing]);
  // Adding a game shouldn't close the whole panel - clearing just the query/results (autoFocus
  // on the input keeps focus) lets the user search-then-add the next game right away, which is
  // what actually makes adding several games in a row fast.
  function confirmManualAdd(name: string) {
    setManualQuery("");
    setManualResults([]);
    setLastAddedName(name);
    setTimeout(() => setLastAddedName((cur) => (cur === name ? null : cur)), 2000);
  }
  async function addManualMatched(appid: number, name: string) {
    setManualAdding(true);
    try {
      const loaded = await enrichGames([appid], {}, () => {});
      const game = loaded[appid] ?? blankGame(appid, name);
      onAdd(appid, manualPlatformChoice, game);
      confirmManualAdd(name);
    } finally {
      setManualAdding(false);
    }
  }
  function addManualCustom() {
    const name = manualQuery.trim();
    if (!name) return;
    // Negative so it can never collide with a real Steam appid.
    const appid = -Date.now();
    onAdd(appid, manualPlatformChoice, blankGame(appid, name));
    confirmManualAdd(name);
  }
  return (
    <section className="panel manualAddPanel">
      <div className="manualAddHeader">
        <span>게임 추가</span>
        <button type="button" className="filterCloseBtn" onClick={onClose} aria-label="닫기">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="4" y1="4" x2="20" y2="20" />
            <line x1="20" y1="4" x2="4" y2="20" />
          </svg>
        </button>
      </div>
      <div className="row">
        <div className="field">
          <input
            autoFocus
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(e) => {
              setIsComposing(false);
              setManualQuery(e.currentTarget.value);
            }}
            placeholder="게임 이름"
          />
        </div>
        <div className="manualAddRow">
          <select
            value={manualPlatformChoice}
            onChange={(e) => setManualPlatformChoice(e.target.value as ManualPlatform)}
          >
            {(Object.keys(MANUAL_PLATFORM_LABELS) as ManualPlatform[]).map((p) => (
              <option key={p} value={p}>
                {MANUAL_PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="smallBtn"
            onClick={addManualCustom}
            disabled={!manualQuery.trim() || manualAdding}
            title="검색 결과에 원하는 게임이 없을 때, Steam 정보 없이 입력한 이름 그대로 추가합니다"
          >
            검색 결과 없이 이름만 추가
          </button>
        </div>
      </div>
      {manualSearching && <p className="manualSearchingNote">검색 중...</p>}
      {lastAddedName && <p className="manualAddedNote">✓ {lastAddedName} 추가됨</p>}
      {manualResults.length > 0 && (
        <ul className="manualResults">
          {manualResults.map((r) => (
            <li key={r.appid}>
              <button
                type="button"
                className="manualResultBtn"
                onClick={() => addManualMatched(r.appid, r.name)}
                disabled={manualAdding}
              >
                {r.image && <img src={r.image} alt="" />}
                <span>{r.name}</span>
                {r.isDlc && <span className="dlcTag">DLC</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
// Shared by both loaders: fetch store data for whatever appids aren't already loaded, then keep
// retrying just the still-missing ones a few times at a gentle pace. Returns the cumulative map;
// onProgress is called after every chunk so callers can mirror it into their own state/cache.
async function enrichGames(
  appids: number[],
  existingGames: Record<number, Game>,
  onProgress: (loaded: Record<number, Game>) => void,
  // A plain page load only needs to fill in whatever's missing from the cache - but an explicit
  // "새로고침"/"가져오기" is the user asking for current data, so it has to re-fetch appids that
  // are already cached too. Without this, price/discount/review fields (which do change over
  // time, unlike name/genres) would never update past their first fetch no matter how many times
  // the user refreshes.
  forceRefresh = false,
): Promise<Record<number, Game>> {
  // Build a new object per update instead of mutating in place - callers pass this straight into
  // setState, and mutating the same reference across calls means React (and any useMemo keyed on
  // it) can't tell later updates happened at all, since it looks like the "same" state each time.
  let loaded: Record<number, Game> = { ...existingGames };
  async function fetchChunk(chunk: number[]): Promise<Record<string, Game> | null> {
    const r = await fetch(`/api/games?appids=${chunk.join(",")}`);
    const d = await r.json();
    return r.ok ? (d.games ?? {}) : null;
  }
  const missingInitial = appids.filter((id) => forceRefresh || !(id in loaded));
  for (let i = 0; i < missingInitial.length; i += CHUNK) {
    const newGames = await fetchChunk(missingInitial.slice(i, i + CHUNK));
    if (!newGames) continue;
    loaded = { ...loaded, ...newGames };
    onProgress(loaded);
  }
  // Only one short retry: some appids (delisted, tools, soundtracks, redirected listings) never
  // resolve no matter how many times you ask, and IStoreBrowseService hasn't shown any sign of
  // being rate-limited in practice - so there's nothing to gain from hammering it further. Uses
  // the same "not yet loaded" check regardless of forceRefresh - the first pass already covered
  // every appid when forcing, so this retry is only ever for genuinely failed fetches.
  for (let attempt = 0; attempt < 1; attempt++) {
    const missing = appids.filter((id) => !(id in loaded));
    if (!missing.length) break;
    await sleep(2000);
    for (let i = 0; i < missing.length; i += CHUNK) {
      const newGames = await fetchChunk(missing.slice(i, i + CHUNK));
      if (!newGames) continue;
      loaded = { ...loaded, ...newGames };
      onProgress(loaded);
    }
  }
  return loaded;
}
// Metacritic only comes from the old per-game endpoint that used to rate-limit the whole app, so
// it's fetched separately, after the fast main load, at a gentle pace - and stops for good the
// moment the server signals it's blocked, instead of ever retrying into that mess again.
async function enrichMetacritic(
  appids: number[],
  initialGames: Record<number, Game>,
  onUpdate: (games: Record<number, Game>) => void,
) {
  let current = initialGames;
  const missing = appids.filter((id) => current[id] && current[id].metacritic == null);
  for (let i = 0; i < missing.length; i += META_CHUNK) {
    const chunk = missing.slice(i, i + META_CHUNK);
    const r = await fetch(`/api/metacritic?appids=${chunk.join(",")}`);
    const d = await r.json();
    if (!r.ok) return;
    const updates: Record<number, Game> = {};
    for (const [id, score] of Object.entries(d.scores ?? {})) {
      const appid = Number(id);
      if (current[appid]) updates[appid] = { ...current[appid], metacritic: score as number };
    }
    current = { ...current, ...updates };
    onUpdate(current);
    if (d.blocked) return;
  }
}
// Achievement completion is per-account, per-game data with no batch endpoint on Steam's side,
// so it's fetched as its own slow background pass (library only) after the main load - a missing
// key means "not checked yet", an explicit null means "checked, this game has no achievements".
async function enrichAchievements(
  appids: number[],
  steamId: string,
  apiKey: string,
  initial: Record<number, AchievementInfo | null>,
  onUpdate: (map: Record<number, AchievementInfo | null>) => void,
) {
  let current = initial;
  const missing = appids.filter((id) => !(id in current));
  for (let i = 0; i < missing.length; i += ACHIEVEMENT_CHUNK) {
    const chunk = missing.slice(i, i + ACHIEVEMENT_CHUNK);
    const r = await fetch(
      `/api/achievements?steamid=${encodeURIComponent(steamId)}&key=${encodeURIComponent(apiKey)}&appids=${chunk.join(",")}`,
    );
    const d = await r.json();
    if (!r.ok) return;
    const updates: Record<number, AchievementInfo | null> = {};
    for (const [id, info] of Object.entries(d.achievements ?? {})) {
      updates[Number(id)] = info as AchievementInfo | null;
    }
    current = { ...current, ...updates };
    onUpdate(current);
    if (d.blocked) return;
  }
}
export default function Wishlist() {
  const [view, setView] = useState<View>("wishlist");
  const [wlSteamId, setWlSteamId] = useState("");
  const [libSteamId, setLibSteamId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [wlProfile, setWlProfile] = useState<Profile | null>(null);
  const [wlProfileError, setWlProfileError] = useState("");
  const [libProfile, setLibProfile] = useState<Profile | null>(null);
  const [libProfileError, setLibProfileError] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  // Reopens the credential form after data's already loaded for this tab (it auto-hides on
  // success) so the user can switch accounts or re-enter a key without a dedicated logout step.
  const [wlEditingCreds, setWlEditingCreds] = useState(false);
  const [libEditingCreds, setLibEditingCreds] = useState(false);

  const [wlItems, setWlItems] = useState<Item[]>([]);
  const [wlGames, setWlGames] = useState<Record<number, Game>>({});
  const [wlLoading, setWlLoading] = useState(false);
  const [wlProgress, setWlProgress] = useState({ done: 0, total: 0 });
  const [wlError, setWlError] = useState("");
  // Distinguishes "never fetched" from "fetched, got zero back" - the latter almost always means
  // the target account's wishlist/library visibility is private, since Steam returns an empty
  // result rather than an explicit permission error either way.
  const [wlFetchedOnce, setWlFetchedOnce] = useState(false);

  const [libItems, setLibItems] = useState<Item[]>([]);
  const [libGames, setLibGames] = useState<Record<number, Game>>({});
  const [libLoading, setLibLoading] = useState(false);
  const [libProgress, setLibProgress] = useState({ done: 0, total: 0 });
  const [libError, setLibError] = useState("");
  const [libFetchedOnce, setLibFetchedOnce] = useState(false);
  const [manualPlatform, setManualPlatform] = useState<Record<number, ManualPlatform>>({});
  const [manualGames, setManualGames] = useState<Record<number, Game>>({});
  const [manualPlaytime, setManualPlaytime] = useState<Record<number, number>>({});
  function persistManual(
    platformValue: Record<number, ManualPlatform>,
    gamesValue: Record<number, Game>,
  ) {
    try {
      localStorage.setItem(MANUAL_PLATFORM_STORAGE_KEY, JSON.stringify(platformValue));
      localStorage.setItem(MANUAL_GAMES_STORAGE_KEY, JSON.stringify(gamesValue));
    } catch {}
    pushSync({ manualPlatform: platformValue, manualGames: gamesValue });
  }
  function setManualPlaytimeHours(appid: number, hours: number | null) {
    const next = { ...manualPlaytime };
    if (hours == null || !(hours > 0)) delete next[appid];
    else next[appid] = Math.round(hours * 60);
    setManualPlaytime(next);
    try {
      localStorage.setItem(MANUAL_PLAYTIME_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    pushSync({ manualPlaytime: next });
  }
  // A library refresh only ever touches libItems/libGames (the Steam-fetched half), so merging
  // manual entries in here - rather than mixing them into libItems itself - means they survive
  // every "라이브러리 가져오기" click instead of being wiped by it.
  const combinedLibItems: Item[] = useMemo(
    () => [
      ...libItems,
      ...Object.keys(manualPlatform).map((id) => ({
        appid: Number(id),
        playtimeMinutes: manualPlaytime[Number(id)],
      })),
    ],
    [libItems, manualPlatform, manualPlaytime],
  );
  const combinedLibGames = useMemo(
    () => ({ ...libGames, ...manualGames }),
    [libGames, manualGames],
  );
  const [manualFormOpen, setManualFormOpen] = useState(false);

  const items = view === "wishlist" ? wlItems : combinedLibItems;
  const games = view === "wishlist" ? wlGames : combinedLibGames;
  const loading = view === "wishlist" ? wlLoading : libLoading;
  const progress = view === "wishlist" ? wlProgress : libProgress;
  const error = view === "wishlist" ? wlError : libError;
  const fetchedOnce = view === "wishlist" ? wlFetchedOnce : libFetchedOnce;
  const steamId = view === "wishlist" ? wlSteamId : libSteamId;
  const setSteamId = view === "wishlist" ? setWlSteamId : setLibSteamId;
  const profile = view === "wishlist" ? wlProfile : libProfile;
  const profileError = view === "wishlist" ? wlProfileError : libProfileError;
  const editingCreds = view === "wishlist" ? wlEditingCreds : libEditingCreds;
  function openCredsForm() {
    if (view === "wishlist") setWlEditingCreds(true);
    else setLibEditingCreds(true);
  }
  const dataLoadedForView = view === "wishlist" ? wlItems.length > 0 : libItems.length > 0;
  const formVisible = editingCreds || !dataLoadedForView;

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  function selectSortKey(key: SortKey) {
    setSortKey((prev) => (prev === key ? null : key));
  }
  function switchView(next: View) {
    setView(next);
    setSortKey(null);
    // Convenience default, not a hard link between the two - same person uses both tabs far more
    // often than not, so prefill from whatever's already on the wishlist tab, but only if the
    // library tab hasn't been given its own value yet (never overwrites something already typed).
    if (next === "library" && !libSteamId && wlSteamId) {
      setLibSteamId(wlSteamId);
    }
  }
  const [nameQuery, setNameQuery] = useState("");
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);
  const [excludeEarlyAccess, setExcludeEarlyAccess] = useState(false);
  const [excludeComingSoon, setExcludeComingSoon] = useState(false);
  const [koreanFilter, setKoreanFilter] = useState<"supported" | "unsupported" | null>(null);
  function selectKoreanFilter(v: "supported" | "unsupported") {
    setKoreanFilter((prev) => (prev === v ? null : v));
  }
  const [excludeAdult, setExcludeAdult] = useState(false);
  const [excludeDemo, setExcludeDemo] = useState(false);
  // Only 필터/정렬/장르 start open - the rest (한국어/플랫폼/진행 상태/별점/추천) default collapsed
  // so the sidebar doesn't open on a wall of expanded checkbox lists.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(["korean", "platform", "status", "star", "rating"]),
  );
  // Mirrors the 900px CSS breakpoint so JS-driven layout decisions (row height, the filter
  // drawer) stay in sync with it, including live orientation/resize changes.
  const [isMobile, setIsMobile] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // On mobile the sidebar stacks above the game list instead of sitting beside it, so every
  // filter group expanded by default (especially the ~40-entry genre list) buries the list under
  // a wall of checkboxes. Collapse everything on first mount there; desktop keeps them all open.
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mq.matches);
    if (mq.matches) {
      setCollapsedGroups(
        new Set([
          "discount",
          "korean",
          "libraryFilter",
          "status",
          "rating",
          "platform",
          "sort",
          "genre",
        ]),
      );
    }
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);
  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const [genreFilter, setGenreFilter] = useState<number[]>([]);
  function toggleGenre(genreId: number) {
    setGenreFilter((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId],
    );
  }
  const [statusMap, setStatusMap] = useState<Record<number, PlayStatus>>({});
  const [statusFilter, setStatusFilter] = useState<(PlayStatus | "none")[]>([]);
  function toggleStatusFilter(s: PlayStatus | "none") {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function setGameStatus(appid: number, status: PlayStatus | null) {
    const next = { ...statusMap };
    if (status) next[appid] = status;
    else delete next[appid];
    setStatusMap(next);
    try {
      localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    pushSync({ statusMap: next });
  }
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      playing: 0,
      completed: 0,
      incomplete: 0,
      dropped: 0,
      excluded: 0,
      none: 0,
    };
    for (const item of combinedLibItems) {
      const s = statusMap[item.appid];
      counts[s ?? "none"]++;
    }
    return counts;
  }, [combinedLibItems, statusMap]);
  const [ratingMap, setRatingMap] = useState<Record<number, Rating>>({});
  const [ratingFilter, setRatingFilter] = useState<(Rating | "none")[]>([]);
  function toggleRatingFilter(r: Rating | "none") {
    setRatingFilter((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }
  function setGameRating(appid: number, rating: Rating | null) {
    const next = { ...ratingMap };
    if (rating) next[appid] = rating;
    else delete next[appid];
    setRatingMap(next);
    try {
      localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    pushSync({ ratingMap: next });
  }
  const ratingCounts = useMemo(() => {
    const counts: Record<string, number> = { like: 0, dislike: 0, none: 0 };
    for (const item of combinedLibItems) {
      const r = ratingMap[item.appid];
      counts[r ?? "none"]++;
    }
    return counts;
  }, [combinedLibItems, ratingMap]);
  const [starMap, setStarMap] = useState<Record<number, StarRating>>({});
  function setGameStar(appid: number, star: StarRating | null) {
    const next = { ...starMap };
    if (star) next[appid] = star;
    else delete next[appid];
    setStarMap(next);
    try {
      localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    pushSync({ starMap: next });
  }
  const [starFilter, setStarFilter] = useState<(StarRating | "none")[]>([]);
  function toggleStarFilter(s: StarRating | "none") {
    setStarFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  const starCounts = useMemo(() => {
    const counts: Record<string, number> = { none: 0 };
    for (const v of STAR_VALUES) counts[v] = 0;
    for (const item of combinedLibItems) {
      const s = starMap[item.appid];
      counts[s ?? "none"]++;
    }
    return counts;
  }, [combinedLibItems, starMap]);
  const [platformFilter, setPlatformFilter] = useState<("steam" | ManualPlatform)[]>([]);
  function togglePlatformFilter(p: "steam" | ManualPlatform) {
    setPlatformFilter((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = { steam: 0, epic: 0, stove: 0, other: 0 };
    for (const item of combinedLibItems) {
      const p = manualPlatform[item.appid] ?? "steam";
      counts[p]++;
    }
    return counts;
  }, [combinedLibItems, manualPlatform]);
  const koreanCounts = useMemo(() => {
    const counts = { supported: 0, unsupported: 0 };
    for (const item of wlItems) {
      if (wlGames[item.appid]?.koreanSupported) counts.supported++;
      else counts.unsupported++;
    }
    return counts;
  }, [wlItems, wlGames]);
  const discountCount = useMemo(() => {
    let count = 0;
    for (const item of wlItems) {
      if ((wlGames[item.appid]?.discountPercent ?? 0) > 0) count++;
    }
    return count;
  }, [wlItems, wlGames]);
  const [achievementMap, setAchievementMap] = useState<Record<number, AchievementInfo | null>>({});
  // Cross-device sync for the data that can't be re-fetched from Steam (play status, rating,
  // achievements) - localStorage stays the instant local write, this is a best-effort mirror to
  // /api/sync on top of it. No-ops safely if the server has no DB configured.
  function pushSync(overrides: {
    statusMap?: Record<number, PlayStatus>;
    ratingMap?: Record<number, Rating>;
    starMap?: Record<number, StarRating>;
    achievementMap?: Record<number, AchievementInfo | null>;
    manualPlatform?: Record<number, ManualPlatform>;
    manualGames?: Record<number, Game>;
    manualPlaytime?: Record<number, number>;
  }) {
    const id = libSteamId.trim();
    if (!/^\d{17}$/.test(id)) return;
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steamId: id,
        statusMap: overrides.statusMap ?? statusMap,
        ratingMap: overrides.ratingMap ?? ratingMap,
        starMap: overrides.starMap ?? starMap,
        achievementMap: overrides.achievementMap ?? achievementMap,
        manualPlatform: overrides.manualPlatform ?? manualPlatform,
        manualGames: overrides.manualGames ?? manualGames,
        manualPlaytime: overrides.manualPlaytime ?? manualPlaytime,
      }),
    }).catch(() => {});
  }
  function syncFromServer(id: string) {
    fetch(`/api/sync?steamid=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.configured) return;
        // An empty map from the server is indistinguishable from "nothing pushed yet" vs. "you
        // really cleared everything" - so when local already has real entries, prefer local over
        // a server value that would wipe it. A stale/empty push (e.g. from a fresh session that
        // hadn't loaded its own data yet) can otherwise silently erase everything on next load.
        if (
          d.statusMap &&
          (Object.keys(d.statusMap).length > 0 || Object.keys(statusMap).length === 0)
        ) {
          setStatusMap(d.statusMap);
          try {
            localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(d.statusMap));
          } catch {}
        }
        if (
          d.ratingMap &&
          (Object.keys(d.ratingMap).length > 0 || Object.keys(ratingMap).length === 0)
        ) {
          setRatingMap(d.ratingMap);
          try {
            localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(d.ratingMap));
          } catch {}
        }
        if (d.starMap && (Object.keys(d.starMap).length > 0 || Object.keys(starMap).length === 0)) {
          setStarMap(d.starMap);
          try {
            localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify(d.starMap));
          } catch {}
        }
        if (
          d.achievementMap &&
          (Object.keys(d.achievementMap).length > 0 || Object.keys(achievementMap).length === 0)
        ) {
          setAchievementMap(d.achievementMap);
          try {
            localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(d.achievementMap));
          } catch {}
        }
        if (
          d.manualPlatform &&
          (Object.keys(d.manualPlatform).length > 0 || Object.keys(manualPlatform).length === 0)
        ) {
          setManualPlatform(d.manualPlatform);
          try {
            localStorage.setItem(MANUAL_PLATFORM_STORAGE_KEY, JSON.stringify(d.manualPlatform));
          } catch {}
        }
        if (
          d.manualGames &&
          (Object.keys(d.manualGames).length > 0 || Object.keys(manualGames).length === 0)
        ) {
          setManualGames(d.manualGames);
          try {
            localStorage.setItem(MANUAL_GAMES_STORAGE_KEY, JSON.stringify(d.manualGames));
          } catch {}
        }
        if (
          d.manualPlaytime &&
          (Object.keys(d.manualPlaytime).length > 0 || Object.keys(manualPlaytime).length === 0)
        ) {
          setManualPlaytime(d.manualPlaytime);
          try {
            localStorage.setItem(MANUAL_PLAYTIME_STORAGE_KEY, JSON.stringify(d.manualPlaytime));
          } catch {}
        }
      })
      .catch(() => {});
  }
  function updateAchievements(next: Record<number, AchievementInfo | null>) {
    setAchievementMap(next);
    try {
      localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    pushSync({ achievementMap: next });
  }
  const [checkingAchievements, setCheckingAchievements] = useState<Set<number>>(() => new Set());
  // Lets a single row jump the queue instead of waiting for its turn in the slow background pass.
  async function checkOneAchievement(appid: number) {
    if (checkingAchievements.has(appid) || !libSteamId.trim() || !apiKey.trim()) return;
    setCheckingAchievements((prev) => new Set(prev).add(appid));
    try {
      const r = await fetch(
        `/api/achievements?steamid=${encodeURIComponent(libSteamId.trim())}&key=${encodeURIComponent(apiKey.trim())}&appids=${appid}`,
      );
      const d = await r.json();
      if (r.ok && d.achievements) {
        const updates: Record<number, AchievementInfo | null> = {};
        for (const [id, info] of Object.entries(d.achievements)) {
          updates[Number(id)] = info as AchievementInfo | null;
        }
        updateAchievements({ ...achievementMap, ...updates });
      }
    } catch {
    } finally {
      setCheckingAchievements((prev) => {
        const next = new Set(prev);
        next.delete(appid);
        return next;
      });
    }
  }
  // Counts are over games actually in the active list, so the filter list reflects what's really
  // there rather than every tag Steam knows about.
  const genreCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const nameById: Record<number, string> = {};
    for (const item of items) {
      const g = games[item.appid];
      (g?.genreIds ?? []).forEach((id, i) => {
        if (!GENRE_ALLOWLIST_IDS.has(id)) return;
        nameById[id] = g.genres[i];
        counts[id] = (counts[id] ?? 0) + 1;
      });
    }
    return Object.entries(counts)
      .map(([id, count]) => ({ id: Number(id), name: nameById[Number(id)], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, GENRE_FILTER_LIMIT);
  }, [items, games]);
  // Uses GENRE_LEVEL_ALLOWLIST_IDS, not the filter's broader GENRE_ALLOWLIST_IDS - see the comment
  // on that constant. Manual entries have no playtimeMinutes (never actually tracked by Steam), and
  // '제외' (excluded) games don't count either - both silently contribute nothing, so only real
  // owned-and-played, non-excluded games level up a genre.
  const genreXp = useMemo(() => {
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
  }, [combinedLibItems, combinedLibGames, statusMap]);
  const genreLevels = useMemo(
    () =>
      Object.entries(genreXp.xp)
        .map(([id, hours]) => ({
          genreId: Number(id),
          genre: genreXp.nameById[Number(id)],
          hours,
          ...genreLevelInfo(hours),
        }))
        .sort((a, b) => b.hours - a.hours),
    [genreXp],
  );
  // Genre levels are always computed from the library, regardless of which tab is open - so show
  // them on the wishlist tab too, but only when it's tracking the same account as the library.
  // Otherwise the badge would show *your* library's genre level next to a friend's wishlist
  // profile (wishlist and library intentionally support different steamIds - see their comment).
  const showGenreLevels =
    GENRE_LEVELING_ENABLED &&
    genreLevels.length > 0 &&
    genreXp.gameCount >= GENRE_LEVELS_MIN_GAMES &&
    genreXp.totalHours >= GENRE_LEVELS_MIN_HOURS &&
    (view === "library" || wlSteamId === libSteamId);
  // Fine-grained GENRE_ALLOWLIST, not the coarse GENRE_LEVEL_ALLOWLIST - subgenre distinctions
  // like JRPG vs CRPG vs 액션 RPG matter here, unlike for the level badge where they'd just dilute
  // one bucket. A genre only surfaces once it's crossed TASTE_MIN_GAMES games, so a couple of
  // flukes (one dropped game, one over-generous 5-star) can't swing a tiny-sample average.
  const genreTaste = useMemo(() => {
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
      if (statusMap[item.appid] === "excluded") continue;
      const g = combinedLibGames[item.appid];
      const affinity = gameAffinity(
        statusMap[item.appid],
        ratingMap[item.appid],
        starMap[item.appid],
        achievementMap[item.appid],
      );
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
  }, [combinedLibItems, combinedLibGames, statusMap, ratingMap, starMap, achievementMap]);
  // Keyed by genreId for O(1) lookup from recommendScore, rather than re-scanning the array per
  // wishlist game on every sort comparison.
  const genreTasteMap = useMemo(() => {
    const map: Record<number, { affinity: number; games: number }> = {};
    for (const { genreId, affinity, games } of genreTaste) map[genreId] = { affinity, games };
    return map;
  }, [genreTaste]);
  // recommendScore's raw value is only useful for sorting - on a real wishlist it clusters into
  // a narrow band (checked against one real account: -19% to +8%, most within a couple points of
  // the median), so the raw number reads as "barely anything" even for the best match available.
  // Rank instead of value: percentile within the whole wishlist, not just what's currently
  // filtered/visible, so the same game always shows the same number regardless of what filters
  // happen to be active. Ties (identical genre-match sets) share a percentile.
  const recommendPercentile = useMemo(() => {
    if (!GENRE_LEVELING_ENABLED || Object.keys(genreTasteMap).length === 0) return {};
    const scored = wlItems
      .map((item) => ({
        appid: item.appid,
        score: recommendScore(wlGames[item.appid]?.genreIds, genreTasteMap),
      }))
      .filter((x): x is { appid: number; score: number } => x.score != null)
      .sort((a, b) => a.score - b.score);
    const n = scored.length;
    const map: Record<number, number> = {};
    scored.forEach((x, i) => {
      map[x.appid] = n > 1 ? Math.round((i / (n - 1)) * 100) : 100;
    });
    return map;
  }, [wlItems, wlGames, genreTasteMap]);
  const [genreTab, setGenreTab] = useState<"level" | "taste">("level");
  const filteredItems = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return items.filter((item) => {
      const g = games[item.appid];
      if (q && !(g?.name ?? "").toLowerCase().includes(q)) return false;
      if (view === "wishlist" && onlyDiscounted && !(g && g.discountPercent > 0)) return false;
      if (view === "wishlist" && excludeEarlyAccess && g?.earlyAccess) return false;
      if (view === "wishlist" && excludeComingSoon && g?.comingSoon) return false;
      if (view === "wishlist" && koreanFilter) {
        const k = g?.koreanSupported ? "supported" : "unsupported";
        if (koreanFilter !== k) return false;
      }
      if (view === "library" && excludeAdult && g?.adultContent) return false;
      if (view === "library" && excludeDemo && g?.isDemo) return false;
      if (genreFilter.length && !genreFilter.some((id) => (g?.genreIds ?? []).includes(id)))
        return false;
      if (view === "library") {
        const s = statusMap[item.appid] ?? "none";
        // '제외' hides by default regardless of other filters - it's an opt-in view, not just
        // one more option in the whitelist below (which only kicks in once something's checked).
        if (s === "excluded" && !statusFilter.includes("excluded")) return false;
        if (statusFilter.length && !statusFilter.includes(s)) return false;
      }
      if (view === "library" && ratingFilter.length) {
        const r = ratingMap[item.appid] ?? "none";
        if (!ratingFilter.includes(r)) return false;
      }
      if (view === "library" && starFilter.length) {
        const s = starMap[item.appid] ?? "none";
        if (!starFilter.includes(s)) return false;
      }
      if (view === "library" && platformFilter.length) {
        const p = manualPlatform[item.appid] ?? "steam";
        if (!platformFilter.includes(p)) return false;
      }
      return true;
    });
  }, [
    items,
    games,
    nameQuery,
    onlyDiscounted,
    excludeEarlyAccess,
    excludeComingSoon,
    koreanFilter,
    excludeAdult,
    excludeDemo,
    genreFilter,
    view,
    statusFilter,
    statusMap,
    ratingFilter,
    ratingMap,
    starFilter,
    starMap,
    platformFilter,
    manualPlatform,
  ]);
  const sortedItems = useMemo(
    () => sortItems(filteredItems, games, sortKey, achievementMap, genreTasteMap),
    [filteredItems, games, sortKey, achievementMap, genreTasteMap],
  );
  // Drives the mobile filter button's active state - the drawer hides the checkboxes themselves,
  // so this is the only visible sign a filter (or sort, which lives in the same drawer) is
  // narrowing/reordering the list.
  const hasActiveFilter =
    genreFilter.length > 0 ||
    sortKey !== null ||
    (view === "wishlist"
      ? onlyDiscounted || excludeEarlyAccess || excludeComingSoon || koreanFilter !== null
      : excludeAdult ||
        excludeDemo ||
        statusFilter.length > 0 ||
        ratingFilter.length > 0 ||
        starFilter.length > 0 ||
        platformFilter.length > 0);
  const [listWrapRef, listSize] = useElementSize();
  const [layoutMode, setLayoutMode] = useState<"list" | "card">("list");
  // One-time hydration from localStorage on mount; SSR has no localStorage, so this must run in an
  // effect. Uses useLayoutEffect (not useEffect) so it commits before the browser paints - closes
  // the tiny window where a value typed immediately on load could get stomped by this hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    try {
      const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
      setApiKey(savedApiKey);
      const savedWlId = localStorage.getItem(WL_STEAM_ID_STORAGE_KEY);
      if (savedWlId) setWlSteamId(savedWlId);
      const savedLibId = localStorage.getItem(LIB_STEAM_ID_STORAGE_KEY);
      if (savedLibId) setLibSteamId(savedLibId);
      const wl = JSON.parse(localStorage.getItem(WISHLIST_CACHE_KEY) ?? "null");
      if (!savedWlId && wl?.steamId) setWlSteamId(wl.steamId);
      if (wl?.version === CACHE_VERSION && Array.isArray(wl?.items)) {
        setWlItems(wl.items);
        setWlProgress({ done: wl.items.length, total: wl.items.length });
        if (wl.games) setWlGames(wl.games);
      }
      const lib = JSON.parse(localStorage.getItem(LIBRARY_CACHE_KEY) ?? "null");
      if (!savedLibId && lib?.steamId) setLibSteamId(lib.steamId);
      if (lib?.version === CACHE_VERSION && Array.isArray(lib?.items)) {
        setLibItems(lib.items);
        setLibProgress({ done: lib.items.length, total: lib.items.length });
        if (lib.games) setLibGames(lib.games);
      }
      const manualPlatformSaved = JSON.parse(
        localStorage.getItem(MANUAL_PLATFORM_STORAGE_KEY) ?? "null",
      );
      if (manualPlatformSaved && typeof manualPlatformSaved === "object")
        setManualPlatform(manualPlatformSaved);
      const manualGamesSaved = JSON.parse(localStorage.getItem(MANUAL_GAMES_STORAGE_KEY) ?? "null");
      if (manualGamesSaved && typeof manualGamesSaved === "object")
        setManualGames(manualGamesSaved);
      const manualPlaytimeSaved = JSON.parse(
        localStorage.getItem(MANUAL_PLAYTIME_STORAGE_KEY) ?? "null",
      );
      if (manualPlaytimeSaved && typeof manualPlaytimeSaved === "object")
        setManualPlaytime(manualPlaytimeSaved);
      const status = JSON.parse(localStorage.getItem(STATUS_STORAGE_KEY) ?? "null");
      if (status && typeof status === "object") setStatusMap(status);
      const rating = JSON.parse(localStorage.getItem(RATING_STORAGE_KEY) ?? "null");
      if (rating && typeof rating === "object") setRatingMap(rating);
      const stars = JSON.parse(localStorage.getItem(STAR_STORAGE_KEY) ?? "null");
      if (stars && typeof stars === "object") setStarMap(stars);
      const achievements = JSON.parse(localStorage.getItem(ACHIEVEMENT_STORAGE_KEY) ?? "null");
      if (achievements && typeof achievements === "object") setAchievementMap(achievements);
      // Item/game caches are already restored above; only the profiles still need a fresh fetch to
      // show the profile card again. Wishlist and library are independent identities, so each gets
      // its own restore - the wishlist one never had a key to begin with (server falls back to its
      // own STEAM_API_KEY env var), while the library one reuses a saved key if there is one.
      if (savedWlId) {
        fetch(`/api/profile?steamid=${encodeURIComponent(savedWlId)}`)
          .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (ok && d.profile) setWlProfile(d.profile);
          })
          .catch(() => {});
      }
      if (savedLibId) {
        const url = savedApiKey
          ? `/api/profile?steamid=${encodeURIComponent(savedLibId)}&key=${encodeURIComponent(savedApiKey)}`
          : `/api/profile?steamid=${encodeURIComponent(savedLibId)}`;
        fetch(url)
          .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (ok && d.profile) setLibProfile(d.profile);
          })
          .catch(() => {});
        // Pulls in whatever another device already synced, on top of the localStorage restore
        // above - lets status/rating/achievements show up here without re-fetching the library.
        syncFromServer(savedLibId);
      }
    } catch {}
    // Intentionally mount-only (see comment above the effect) - syncFromServer is recreated every
    // render, but only the version captured here, at mount, is ever meant to run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  function persistTo(
    cacheKey: string,
    steamIdValue: string,
    itemsValue: Item[],
    gamesValue: Record<number, Game>,
  ) {
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          version: CACHE_VERSION,
          steamId: steamIdValue,
          items: itemsValue,
          games: gamesValue,
        }),
      );
    } catch {}
  }
  const lastWlPersistAt = useRef(0);
  const lastLibPersistAt = useRef(0);
  function persistWishlistThrottled(itemsValue: Item[], gamesValue: Record<number, Game>) {
    const now = Date.now();
    if (now - lastWlPersistAt.current < 1500) return;
    lastWlPersistAt.current = now;
    persistTo(WISHLIST_CACHE_KEY, wlSteamId, itemsValue, gamesValue);
  }
  function persistLibraryThrottled(itemsValue: Item[], gamesValue: Record<number, Game>) {
    // Event-handler-only helper, never called during render - the compiler's reachability
    // analysis mis-flags it once enough other code is added to this component (not reproducible
    // in isolation, and reactCompiler isn't even enabled in next.config, so no build/runtime
    // effect either way).
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    if (now - lastLibPersistAt.current < 1500) return;
    lastLibPersistAt.current = now;
    persistTo(LIBRARY_CACHE_KEY, libSteamId, itemsValue, gamesValue);
  }
  function removeManualGame(appid: number) {
    const nextPlatform = { ...manualPlatform };
    delete nextPlatform[appid];
    const nextGames = { ...manualGames };
    delete nextGames[appid];
    setManualPlatform(nextPlatform);
    setManualGames(nextGames);
    persistManual(nextPlatform, nextGames);
    setManualPlaytimeHours(appid, null);
    setGameStatus(appid, null);
    setGameRating(appid, null);
  }
  async function loadWishlist() {
    const id = wlSteamId.trim();
    if (!/^\d{17}$/.test(id)) {
      setWlError("17자리 Steam ID64를 입력하세요.");
      return;
    }
    try {
      if (rememberMe) localStorage.setItem(WL_STEAM_ID_STORAGE_KEY, id);
      else localStorage.removeItem(WL_STEAM_ID_STORAGE_KEY);
    } catch {}
    // Fire-and-forget, same as the library tab's profile fetch - no user-entered key needed here,
    // the server falls back to its own STEAM_API_KEY env var for this lookup.
    setWlProfileError("");
    fetch(`/api/profile?steamid=${encodeURIComponent(id)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d.profile) setWlProfile(d.profile);
      })
      .catch(() => {});
    setWlLoading(true);
    setWlError("");
    try {
      const r = await fetch(`/api/wishlist?steamid=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const list: Item[] = (d.items ?? []).map((x: { appid: number }) => ({ appid: x.appid }));
      setWlItems(list);
      setWlFetchedOnce(true);
      setWlEditingCreds(false);
      const listAppids = new Set(list.map((x) => x.appid));
      const existing: Record<number, Game> = {};
      for (const [id, g] of Object.entries(wlGames)) {
        if (listAppids.has(Number(id))) existing[Number(id)] = g;
      }
      setWlGames(existing);
      setWlProgress({ done: Object.keys(existing).length, total: list.length });
      persistTo(WISHLIST_CACHE_KEY, id, list, existing);
      const appids = list.map((x) => x.appid);
      const loaded = await enrichGames(
        appids,
        existing,
        (cur) => {
          setWlGames(cur);
          setWlProgress({ done: Object.keys(cur).length, total: list.length });
          persistWishlistThrottled(list, cur);
        },
        true,
      );
      persistTo(WISHLIST_CACHE_KEY, id, list, loaded);
      enrichMetacritic(appids, loaded, (cur) => {
        setWlGames(cur);
        persistWishlistThrottled(list, cur);
      }).catch(() => {});
    } catch (e) {
      setWlError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setWlLoading(false);
    }
  }
  async function loadLibrary() {
    const id = libSteamId.trim();
    const key = apiKey.trim();
    if (!/^\d{17}$/.test(id)) {
      setLibError("17자리 Steam ID64를 입력하세요.");
      return;
    }
    if (!key) {
      setLibError("Steam API 키를 입력하세요.");
      return;
    }
    try {
      if (rememberMe) {
        localStorage.setItem(LIB_STEAM_ID_STORAGE_KEY, id);
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
      } else {
        localStorage.removeItem(LIB_STEAM_ID_STORAGE_KEY);
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch {}
    // Fire-and-forget alongside the library fetch below - the profile card is a nice-to-have,
    // not something the library load should wait on or fail because of.
    setLibProfileError("");
    fetch(`/api/profile?steamid=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d.profile) {
          setLibProfile(d.profile);
        } else {
          setLibProfile(null);
          setLibProfileError(
            d.error ?? "프로필을 가져오지 못했습니다. Steam ID64/API 키를 확인하세요.",
          );
        }
      })
      .catch(() => {
        setLibProfile(null);
        setLibProfileError("프로필을 가져오지 못했습니다. 네트워크 상태를 확인하세요.");
      });
    syncFromServer(id);
    setLibLoading(true);
    setLibError("");
    try {
      const r = await fetch(
        `/api/library?steamid=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.error) throw new Error(d.error);
      const list: Item[] = (d.items ?? []).map(
        (x: { appid: number; playtimeMinutes: number; lastPlayedTimestamp: number | null }) => ({
          appid: x.appid,
          playtimeMinutes: x.playtimeMinutes,
          lastPlayedTimestamp: x.lastPlayedTimestamp,
        }),
      );
      setLibItems(list);
      setLibFetchedOnce(true);
      setLibEditingCreds(false);
      const listAppids = new Set(list.map((x) => x.appid));
      const existing: Record<number, Game> = {};
      for (const [gid, g] of Object.entries(libGames)) {
        if (listAppids.has(Number(gid))) existing[Number(gid)] = g;
      }
      setLibGames(existing);
      setLibProgress({ done: Object.keys(existing).length, total: list.length });
      persistTo(LIBRARY_CACHE_KEY, id, list, existing);
      const appids = list.map((x) => x.appid);
      const loaded = await enrichGames(
        appids,
        existing,
        (cur) => {
          setLibGames(cur);
          setLibProgress({ done: Object.keys(cur).length, total: list.length });
          persistLibraryThrottled(list, cur);
        },
        true,
      );
      persistTo(LIBRARY_CACHE_KEY, id, list, loaded);
      // Library doesn't show or sort by metacritic/review anywhere, so there's nothing to spend
      // that rate-limited endpoint's budget on here - only the wishlist view enriches it.
      const achievementOrder = prioritizeAchievementOrder(list, loaded, sortKey, {
        nameQuery,
        genreFilter,
        statusFilter,
        ratingFilter,
        starFilter,
        platformFilter,
        excludeAdult,
        excludeDemo,
        statusMap,
        ratingMap,
        starMap,
        manualPlatform,
      });
      enrichAchievements(achievementOrder, id, key, achievementMap, updateAchievements).catch(
        () => {},
      );
    } catch (e) {
      setLibError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLibLoading(false);
    }
  }
  const loadActive = view === "wishlist" ? loadWishlist : loadLibrary;
  return (
    <div className="page">
      {loading && progress.total > 0 && (
        <div
          className="topProgressBar"
          title={`게임 정보 불러오는 중 ${progress.done} / ${progress.total}`}
        >
          <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      <aside className="sidebar">
        <header>
          <p className="eyebrow">PERSONAL STEAM TOOL</p>
          <h1>{view === "wishlist" ? "My Steam Wishlist" : "My Steam Library"}</h1>
          {(profile || !formVisible) && (
            <div className="profileRow">
              {profile && (
                <div className="profileCard">
                  {profile.avatarUrl && (
                    <a
                      className="profileAvatarLink"
                      href={profile.profileUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Steam 프로필 열기"
                    >
                      <img className="profileAvatar" src={profile.avatarUrl} alt="" />
                    </a>
                  )}
                  <div className="profileCardText">
                    {showGenreLevels && (
                      <div className="profileTopGenre">
                        <button
                          type="button"
                          className="genreLevelBadge"
                          popoverTarget="genre-level-popover"
                          title={
                            genreTaste[0]
                              ? `선호 1위: ${genreTaste[0].genre} (${
                                  Math.round((genreTaste[0].affinity - 1) * 100) >= 0 ? "+" : ""
                                }${Math.round((genreTaste[0].affinity - 1) * 100)}%)`
                              : undefined
                          }
                        >
                          <GenreGlyph genreId={genreLevels[0].genreId} className="genreGlyph" />
                          {genreLevels[0].genre} <b>Lv.{genreLevels[0].level}</b>
                        </button>
                      </div>
                    )}
                    <span className="profileName">{profile.personaName}</span>
                  </div>
                </div>
              )}
              {!formVisible && (
                <button
                  type="button"
                  className="smallBtn iconOnly"
                  onClick={openCredsForm}
                  title="계정 변경"
                  aria-label="계정 변경"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {showGenreLevels && (
            <div popover="auto" id="genre-level-popover" className="genreLevelPopover">
              <div className="genreLevelHeader">
                <span className="genreLevelTitle">
                  장르 프로필
                  <span
                    className="helpIcon"
                    title="라이브러리에 장르가 매칭되는 게임이 5개 이상, 누적 10시간 이상 쌓여야 이 프로필이 나타납니다. 레벨 = ⌊√(누적시간 ÷ 5)⌋ (Lv.1=5시간, Lv.2=20시간, Lv.3=45시간... 뒤로 갈수록 완만해지는 곡선). 21개 굵은 장르 카테고리로 집계되며, 게임 하나가 여러 장르에 걸치면 시간을 균등 분배합니다. 플레이타임 0시간이거나 '제외' 상태인 게임은 집계에서 빠집니다. 장르 선호도(%)는 절대 기준이 아니라 본인의 전체 평균 대비 상대값이며, 최소 12개 이상 보유한 장르만 표시됩니다."
                  >
                    ?
                  </span>
                </span>
                <button
                  type="button"
                  className="filterCloseBtn"
                  popoverTarget="genre-level-popover"
                  popoverTargetAction="hide"
                  aria-label="닫기"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="4" y1="4" x2="20" y2="20" />
                    <line x1="20" y1="4" x2="4" y2="20" />
                  </svg>
                </button>
              </div>
              <div className="genreTabRow">
                <button
                  type="button"
                  className={"genreTab " + (genreTab === "level" ? "active" : "")}
                  onClick={() => setGenreTab("level")}
                >
                  장르 레벨
                </button>
                {genreTaste.length > 0 && (
                  <button
                    type="button"
                    className={"genreTab " + (genreTab === "taste" ? "active" : "")}
                    onClick={() => setGenreTab("taste")}
                  >
                    장르 선호도
                  </button>
                )}
              </div>
              {genreTab === "level" && (
                <>
                  <GenreRadar
                    entries={genreLevels
                      .slice(0, 8)
                      .map(({ genreId, genre, hours }) => ({ genreId, genre, value: hours }))}
                  />
                  <div className="genreChartScroll">
                    {(() => {
                      const maxHours = genreLevels[0]?.hours || 1;
                      return genreLevels.map(({ genreId, genre, hours, level }) => (
                        <div
                          key={genreId}
                          className="chartRow"
                          title={`${genre} · Lv.${level} · ${Math.round(hours)}시간`}
                        >
                          <span className="chartLabel">
                            <GenreGlyph genreId={genreId} className="genreGlyph" />
                            {genre}
                          </span>
                          <div className="chartTrack">
                            <i
                              className="chartBar"
                              style={
                                {
                                  "--bar-pct": `${(hours / maxHours) * 100}%`,
                                } as CSSProperties
                              }
                            />
                          </div>
                          <span className="chartValue">Lv.{level}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
              {genreTab === "taste" && genreTaste.length > 0 && (
                <>
                  <div className="genreTasteHint">실험적 기능 - 위시리스트 추천에 활용 예정</div>
                  <div className="genreChartScroll">
                    {genreTaste.map(({ genreId, genre, games, affinity }) => {
                      const pct = Math.round((affinity - 1) * 100);
                      const barPct =
                        (Math.min(Math.abs(pct), TASTE_PCT_DOMAIN) / TASTE_PCT_DOMAIN) * 100;
                      return (
                        <div
                          key={genreId}
                          className="divergeRow"
                          title={`${genre} · ${games}개 게임 · ${pct >= 0 ? "+" : ""}${pct}%`}
                        >
                          <span className="chartLabel">
                            <GenreGlyph
                              genreId={GENRE_ICON_PARENT[genreId] ?? genreId}
                              className="genreGlyph"
                            />
                            {genre}
                          </span>
                          <div className="divergeTrack">
                            <div className="divergeHalf bad">
                              {pct < 0 && (
                                <i
                                  className="divergeBar bad"
                                  style={{ "--bar-pct": `${barPct}%` } as CSSProperties}
                                />
                              )}
                            </div>
                            <div className="divergeCenter" />
                            <div className="divergeHalf good">
                              {pct >= 0 && (
                                <i
                                  className="divergeBar good"
                                  style={{ "--bar-pct": `${barPct}%` } as CSSProperties}
                                />
                              )}
                            </div>
                          </div>
                          <span className={"chartValue " + (pct >= 0 ? "good" : "bad")}>
                            {pct >= 0 ? "+" : ""}
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </header>
        <div className="viewTabs">
          <button
            className={"tabBtn " + (view === "wishlist" ? "active" : "")}
            onClick={() => switchView("wishlist")}
          >
            찜목록
          </button>
          <button
            className={"tabBtn " + (view === "library" ? "active" : "")}
            onClick={() => switchView("library")}
          >
            라이브러리
          </button>
        </div>
        {formVisible && (
          <section className="panel form">
            <div className="row">
              {view === "wishlist" ? (
                <div className="field">
                  <label>
                    Steam ID64
                    <span
                      className="helpIcon"
                      title="프로필 페이지 URL의 숫자입니다 (steamcommunity.com/profiles/76561198xxxxxxxxx 형태). 커스텀 URL(steamcommunity.com/id/닉네임)이면 steamid.io 같은 사이트에서 변환하세요."
                    >
                      ?
                    </span>
                  </label>
                  <input
                    value={steamId}
                    onChange={(e) => setSteamId(e.target.value)}
                    placeholder="Steam ID64"
                    onKeyDown={(e) => e.key === "Enter" && loadWishlist()}
                  />
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>
                      Steam ID64
                      <span
                        className="helpIcon"
                        title="프로필 페이지 URL의 숫자입니다 (steamcommunity.com/profiles/76561198xxxxxxxxx 형태). 커스텀 URL(steamcommunity.com/id/닉네임)이면 steamid.io 같은 사이트에서 변환하세요. 찜목록 탭과는 별개의 값이라, 라이브러리를 보고 싶은 계정의 ID64를 여기에 따로 입력하세요."
                      >
                        ?
                      </span>
                    </label>
                    <input
                      value={steamId}
                      onChange={(e) => setSteamId(e.target.value)}
                      placeholder="Steam ID64"
                      onKeyDown={(e) => e.key === "Enter" && loadLibrary()}
                    />
                  </div>
                  <div className="field">
                    <label>
                      Steam API 키
                      <span
                        className="helpIcon"
                        title="steamcommunity.com/dev/apikey 에서 발급받으세요 (Domain Name엔 아무거나 입력, 예: localhost). 개인정보 설정에서 '게임 세부정보'가 공개여야 라이브러리를 가져올 수 있습니다."
                      >
                        ?
                      </span>
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Steam API 키"
                      onKeyDown={(e) => e.key === "Enter" && loadLibrary()}
                    />
                  </div>
                </>
              )}
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                이 정보 저장
              </label>
              <button type="button" onClick={loadActive} disabled={loading}>
                {loading
                  ? "가져오는 중..."
                  : view === "wishlist"
                    ? "찜목록 가져오기"
                    : "라이브러리 가져오기"}
              </button>
            </div>
          </section>
        )}
        {profileError && <section className="error">{profileError}</section>}
        {error && (
          <section className="error">
            {error}
            <button type="button" className="retryBtn" onClick={loadActive} disabled={loading}>
              {loading ? "다시 시도 중..." : "다시 시도"}
            </button>
          </section>
        )}
        <section className={"panel filterPanel" + (mobileFiltersOpen ? " mobileOpen" : "")}>
          <div className="filterPanelHeader">
            <span>필터</span>
            <button
              type="button"
              className="filterCloseBtn"
              onClick={() => setMobileFiltersOpen(false)}
              aria-label="필터 닫기"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="4" y1="4" x2="20" y2="20" />
                <line x1="20" y1="4" x2="4" y2="20" />
              </svg>
            </button>
          </div>
          {view === "wishlist" && (
            <FilterGroup
              title="필터"
              collapsed={collapsedGroups.has("discount")}
              onToggle={() => toggleGroup("discount")}
              activeCount={
                (onlyDiscounted ? 1 : 0) +
                (excludeEarlyAccess ? 1 : 0) +
                (excludeComingSoon ? 1 : 0)
              }
            >
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={onlyDiscounted}
                  onChange={() => setOnlyDiscounted((v) => !v)}
                />
                할인 중 ({discountCount})
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeEarlyAccess}
                  onChange={() => setExcludeEarlyAccess((v) => !v)}
                />
                앞서 해보기 제외
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeComingSoon}
                  onChange={() => setExcludeComingSoon((v) => !v)}
                />
                출시 예정 제외
              </label>
            </FilterGroup>
          )}
          {view === "library" && (
            <FilterGroup
              title="필터"
              collapsed={collapsedGroups.has("libraryFilter")}
              onToggle={() => toggleGroup("libraryFilter")}
              activeCount={excludeDemo ? 1 : 0}
            >
              {/* <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeAdult}
                  onChange={() => setExcludeAdult((v) => !v)}
                />
                선정적 콘텐츠 제외
              </label> */}
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeDemo}
                  onChange={() => setExcludeDemo((v) => !v)}
                />
                데모 제외
              </label>
            </FilterGroup>
          )}
          <FilterGroup
            title="정렬"
            collapsed={collapsedGroups.has("sort")}
            onToggle={() => toggleGroup("sort")}
            activeCount={sortKey ? 1 : 0}
          >
            {(view === "wishlist"
              ? WISHLIST_SORT_OPTIONS.filter(
                  (opt) =>
                    opt.value !== "recommend-desc" ||
                    (GENRE_LEVELING_ENABLED && genreTaste.length > 0 && wlSteamId === libSteamId),
                )
              : LIBRARY_SORT_OPTIONS
            ).map((opt) => (
              <label key={opt.value} className="sortCheck">
                <input
                  type="checkbox"
                  checked={sortKey === opt.value}
                  onChange={() => selectSortKey(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </FilterGroup>
          {view === "wishlist" && (
            <FilterGroup
              title="한국어"
              collapsed={collapsedGroups.has("korean")}
              onToggle={() => toggleGroup("korean")}
              activeCount={koreanFilter ? 1 : 0}
            >
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={koreanFilter === "supported"}
                  onChange={() => selectKoreanFilter("supported")}
                />
                한국어 지원 ({koreanCounts.supported})
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={koreanFilter === "unsupported"}
                  onChange={() => selectKoreanFilter("unsupported")}
                />
                한국어 미지원 ({koreanCounts.unsupported})
              </label>
            </FilterGroup>
          )}
          {view === "library" && (
            <FilterGroup
              title="플랫폼"
              collapsed={collapsedGroups.has("platform")}
              onToggle={() => toggleGroup("platform")}
              activeCount={platformFilter.length}
            >
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={platformFilter.includes("steam")}
                  onChange={() => togglePlatformFilter("steam")}
                />
                Steam ({platformCounts.steam})
              </label>
              {(["epic", "stove", "other"] as const).map((p) => (
                <label key={p} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={platformFilter.includes(p)}
                    onChange={() => togglePlatformFilter(p)}
                  />
                  {MANUAL_PLATFORM_LABELS[p]} ({platformCounts[p]})
                </label>
              ))}
            </FilterGroup>
          )}
          {view === "library" && (
            <FilterGroup
              title="진행 상태"
              collapsed={collapsedGroups.has("status")}
              onToggle={() => toggleGroup("status")}
              activeCount={statusFilter.length}
            >
              {STATUS_ORDER.map((s) => (
                <label key={s} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={statusFilter.includes(s)}
                    onChange={() => toggleStatusFilter(s)}
                  />
                  {STATUS_LABELS[s]} ({statusCounts[s]})
                </label>
              ))}
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={statusFilter.includes("none")}
                  onChange={() => toggleStatusFilter("none")}
                />
                미분류 ({statusCounts.none})
              </label>
            </FilterGroup>
          )}
          {view === "library" && (
            <FilterGroup
              title="별점"
              collapsed={collapsedGroups.has("star")}
              onToggle={() => toggleGroup("star")}
              activeCount={starFilter.length}
            >
              {[...STAR_VALUES].reverse().map((v) => (
                <label key={v} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={starFilter.includes(v)}
                    onChange={() => toggleStarFilter(v)}
                  />
                  <StarRow value={v} /> ({starCounts[v] ?? 0})
                </label>
              ))}
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={starFilter.includes("none")}
                  onChange={() => toggleStarFilter("none")}
                />
                미평가 ({starCounts.none})
              </label>
            </FilterGroup>
          )}
          {view === "library" && (
            <FilterGroup
              title="추천"
              collapsed={collapsedGroups.has("rating")}
              onToggle={() => toggleGroup("rating")}
              activeCount={ratingFilter.length}
            >
              {(["like", "dislike"] as const).map((r) => (
                <label key={r} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={ratingFilter.includes(r)}
                    onChange={() => toggleRatingFilter(r)}
                  />
                  {RATING_EMOJI[r]} {RATING_LABELS[r]} ({ratingCounts[r]})
                </label>
              ))}
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={ratingFilter.includes("none")}
                  onChange={() => toggleRatingFilter("none")}
                />
                미평가 ({ratingCounts.none})
              </label>
            </FilterGroup>
          )}
          {genreCounts.length > 0 && (
            <FilterGroup
              title="장르"
              collapsed={collapsedGroups.has("genre")}
              onToggle={() => toggleGroup("genre")}
              activeCount={genreFilter.length}
            >
              {genreCounts.map(({ id, name, count }) => (
                <label key={id} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={genreFilter.includes(id)}
                    onChange={() => toggleGenre(id)}
                  />
                  {name} ({count})
                </label>
              ))}
            </FilterGroup>
          )}
        </section>
      </aside>
      <main className="mainArea">
        <div className="sectionHead">
          <h2>{view === "wishlist" ? "Wishlist" : "Library"}</h2>
          <div className="searchRow">
            <button
              type="button"
              className={"mobileFilterBtn " + (hasActiveFilter ? "active" : "")}
              onClick={() => setMobileFiltersOpen(true)}
              title="필터"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="4" y1="6" x2="20" y2="6" strokeWidth="2" strokeLinecap="round" />
                <line x1="7" y1="12" x2="17" y2="12" strokeWidth="2" strokeLinecap="round" />
                <line x1="10" y1="18" x2="14" y2="18" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <input
              className="searchInput"
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="게임 이름 검색"
            />
          </div>
          <div className="headRight">
            <span className="itemCount">
              <span className="itemCountLabel">
                {view === "wishlist" ? "찜목록" : "보유 게임"}{" "}
              </span>
              {filteredItems.length} / {items.length}개
            </span>
            {view === "library" && (
              <button
                type="button"
                className="refreshBtn"
                onClick={() => setManualFormOpen((v) => !v)}
                title="Epic/STOVE 등 다른 곳에서 산 게임 직접 추가"
              >
                +
              </button>
            )}
            <button
              type="button"
              className="refreshBtn"
              onClick={loadActive}
              disabled={loading}
              title={view === "wishlist" ? "찜목록 새로고침" : "라이브러리 새로고침"}
            >
              <span className={loading ? "spinning" : ""}>⟳</span>
            </button>
            <div className="layoutToggle">
              <button
                type="button"
                className={"layoutToggleBtn " + (layoutMode === "list" ? "active" : "")}
                onClick={() => setLayoutMode("list")}
                title="리스트형"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="5" width="4" height="4" />
                  <rect x="10" y="5" width="10" height="4" />
                  <rect x="4" y="15" width="4" height="4" />
                  <rect x="10" y="15" width="10" height="4" />
                </svg>
              </button>
              <button
                type="button"
                className={"layoutToggleBtn " + (layoutMode === "card" ? "active" : "")}
                onClick={() => setLayoutMode("card")}
                title="카드형"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="8" height="8" />
                  <rect x="13" y="3" width="8" height="8" />
                  <rect x="3" y="13" width="8" height="8" />
                  <rect x="13" y="13" width="8" height="8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        {view === "library" && manualFormOpen && (
          <ManualAddPanel
            onAdd={(appid, platform, game) => {
              const nextPlatform = { ...manualPlatform, [appid]: platform };
              const nextGames = { ...manualGames, [appid]: game };
              setManualPlatform(nextPlatform);
              setManualGames(nextGames);
              persistManual(nextPlatform, nextGames);
            }}
            onClose={() => setManualFormOpen(false)}
          />
        )}
        <div className="listWrap" ref={listWrapRef}>
          {!items.length ? (
            <div className="empty">
              {fetchedOnce
                ? "가져온 항목이 없어요. 이 계정의 " +
                  (view === "wishlist" ? "찜목록" : "라이브러리") +
                  "이 비공개이거나 실제로 비어있을 수 있어요 (Steam은 둘을 구분해서 알려주지 않아요)."
                : view === "wishlist"
                  ? "Steam ID64를 입력하면 실제 찜목록을 가져옵니다."
                  : "Steam ID64와 API 키를 입력하면 보유 게임 목록을 가져옵니다."}
            </div>
          ) : !sortedItems.length ? (
            <div className="empty">조건에 맞는 게임이 없습니다.</div>
          ) : listSize.height > 0 && layoutMode === "list" ? (
            <List
              className="gameList"
              rowComponent={GameRow}
              rowCount={sortedItems.length}
              rowHeight={isMobile ? MOBILE_ROW_HEIGHT : ROW_HEIGHT}
              rowProps={{
                items: sortedItems,
                games,
                view,
                statusMap,
                onSetStatus: setGameStatus,
                ratingMap,
                onSetRating: setGameRating,
                starMap,
                onSetStar: setGameStar,
                achievementMap,
                checkingAchievements,
                onCheckAchievement: checkOneAchievement,
                rowHeight: isMobile ? MOBILE_ROW_HEIGHT : ROW_HEIGHT,
                manualPlatform,
                onRemoveManual: removeManualGame,
                onSetManualPlaytime: setManualPlaytimeHours,
                recommendPercentile,
                sortKey,
                steamId,
              }}
              style={{ height: listSize.height, width: "100%" }}
            />
          ) : listSize.height > 0 && listSize.width > 0 ? (
            (() => {
              const columnCount = Math.max(1, Math.floor(listSize.width / CARD_MIN_WIDTH));
              return (
                <Grid
                  className="gameGrid"
                  cellComponent={CardCell}
                  columnCount={columnCount}
                  columnWidth={`${100 / columnCount}%`}
                  rowCount={Math.ceil(sortedItems.length / columnCount)}
                  rowHeight={CARD_ROW_HEIGHT}
                  cellProps={{
                    items: sortedItems,
                    games,
                    view,
                    columnCount,
                    statusMap,
                    ratingMap,
                    starMap,
                    manualPlatform,
                    onRemoveManual: removeManualGame,
                  }}
                  style={{ height: listSize.height, width: "100%" }}
                />
              );
            })()
          ) : null}
        </div>
      </main>
    </div>
  );
}
