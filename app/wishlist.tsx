"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Grid, List, type CellComponentProps, type RowComponentProps } from "react-window";
type Item = { appid: number; playtimeMinutes?: number };
type View = "wishlist" | "library";
type Profile = { personaName: string | null; avatarUrl: string | null; profileUrl: string | null };
type Game = {
  appid: number;
  name: string;
  headerImage: string | null;
  genres: string[];
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
  | "name-asc";
const WISHLIST_SORT_OPTIONS: { value: SortKey; label: string }[] = [
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
  { value: "achievement-desc", label: "업적 비율 높은순(미완성)" },
  { value: "name-asc", label: "이름순" },
];
// "planned" (미플레이) was dropped as a status: as a chip choice it means the same thing as no
// status at all (미분류), so it added a redundant button without adding information.
type PlayStatus = "playing" | "completed" | "incomplete" | "dropped";
const STATUS_LABELS: Record<PlayStatus, string> = {
  playing: "플레이중",
  completed: "완료",
  incomplete: "보류",
  dropped: "하차",
};
const STATUS_ORDER: PlayStatus[] = ["playing", "completed", "incomplete", "dropped"];
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
// Deliberately much smaller than the genre *filter*'s GENRE_ALLOWLIST (100+ raw Steam tags) - that
// list is great for filtering (fine-grained facets are useful there) but terrible for leveling,
// since near-synonyms ("1인칭 슈팅"/"히어로 슈팅"/"익스트랙션 슈터") would each level up as their
// own separate, diluted bucket instead of one meaningful "슈팅" level. This list only has broad,
// non-overlapping top-level genres.
const GENRE_LEVEL_ALLOWLIST = new Set([
  "액션",
  "어드벤처",
  "RPG",
  "전략",
  "시뮬레이션",
  "스포츠",
  "레이싱",
  "캐주얼",
  "인디",
  "퍼즐",
  "플랫폼",
  "슈팅",
  "공포",
  "생존",
  "로그라이크",
  "격투",
  "MMO",
  "샌드박스",
  "비주얼 노벨",
  "리듬",
  "MOBA",
]);
// Quadratic RPG-style curve: level N needs N^2 * GENRE_XP_PER_LEVEL_SQ cumulative hours (5h/20h/
// 45h/80h/125h...) - cheap early levels, meaningfully harder later. Tune this one constant to
// retune the whole curve.
const GENRE_XP_PER_LEVEL_SQ = 5;
// A genre only enters the taste profile once it's shown up in at least this many owned games -
// below that, one 5-star fluke or one dropped game would swing the average wildly on pure noise.
const TASTE_MIN_GAMES = 12;
// The diverging taste chart's fixed +/-domain, in percentage points off the 1.0 baseline -
// affinity can theoretically range from about -28% to +100%, so 150 gives every real value
// headroom while keeping the 0% baseline a stable, comparable reference point across renders
// (a max-of-the-data scale would make the same score draw a different bar length depending on
// what else is in the library that day).
const TASTE_PCT_DOMAIN = 150;
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
// Bump this whenever the Game shape changes - otherwise old cached entries silently keep
// missing the new fields forever, since "resume from cache" treats them as already loaded.
const CACHE_VERSION = 11;
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
function compareByKey(
  key: SortKey,
  a: Item,
  b: Item,
  games: Record<number, Game>,
  achievementMap: Record<number, AchievementInfo | null>,
): number {
  const ga = games[a.appid];
  const gb = games[b.appid];
  if (key === "price-asc") return (ga?.priceValue ?? Infinity) - (gb?.priceValue ?? Infinity);
  if (key === "review") return (gb?.reviewPositive ?? -1) - (ga?.reviewPositive ?? -1);
  if (key === "metacritic") return (gb?.metacritic ?? -1) - (ga?.metacritic ?? -1);
  if (key === "playtime-desc") return (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0);
  if (key === "achievement-desc")
    return (achievementMap[b.appid]?.percent ?? -1) - (achievementMap[a.appid]?.percent ?? -1);
  if (key === "name-asc") return (ga?.name ?? "").localeCompare(gb?.name ?? "", "ko");
  if (key === "discount-end-asc")
    return (ga?.discountEndTimestamp ?? Infinity) - (gb?.discountEndTimestamp ?? Infinity);
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
): Item[] {
  if (!sortKey) return items;
  return [...items].sort((a, b) => compareByKey(sortKey, a, b, games, achievementMap));
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
    genreFilter: string[];
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
      !filters.genreFilter.some((genre) => g?.genres.includes(genre))
    )
      return false;
    if (filters.statusFilter.length) {
      const s = filters.statusMap[item.appid] ?? "none";
      if (!filters.statusFilter.includes(s)) return false;
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
      ? [...matched].sort((a, b) => compareByKey(sortKey, a, b, loaded, {}))
      : matched;
  return [...ordered, ...rest].map((item) => item.appid);
}
const GENRE_FILTER_LIMIT = 40;
// Steam's community tags mix real genres/mechanics with aesthetic or subjective descriptors
// (귀여운, 여주인공, 2D, ...) that aren't useful as a filter facet and would otherwise crowd out
// actually-common genres by raw tag frequency. This curates the filter panel down to tags that
// describe genre or gameplay mechanics; the per-game tag line elsewhere is unaffected.
const GENRE_ALLOWLIST = new Set([
  "전략",
  "액션",
  "어드벤처",
  "RPG",
  "MMO",
  "인디",
  "캐주얼",
  "시뮬레이션",
  "레이싱",
  "스포츠",
  "플랫폼",
  "메트로배니아",
  "건설",
  "타워 디펜스",
  "핵 앤 슬래시",
  "생존",
  "생존 공포",
  "1인칭 슈팅",
  "3인칭 슈팅",
  "퍼즐",
  "퍼즐 플랫폼",
  "매치 3",
  "카드 게임",
  "트레이딩 카드 게임",
  "공포",
  "심리적 공포",
  "4X",
  "실시간 전략",
  "실시간 전술",
  "턴제",
  "턴제 전략",
  "턴제 전술",
  "판타지",
  "다크 판타지",
  "협동",
  "협동 캠페인",
  "잠입",
  "오픈 월드",
  "포인트 앤드 클릭",
  "크래프팅",
  "전술",
  "로그라이크",
  "로그라이트",
  "정통 로그라이크",
  "로그라이크 덱빌딩",
  "MOBA",
  "던전 크롤러",
  "액션 RTS",
  "창고지기",
  "격투",
  "2D 격투",
  "3D 격투",
  "리듬",
  "MMORPG",
  "보드게임",
  "아케이드",
  "슈팅",
  "탑다운 슈팅",
  "부머 슈팅",
  "비주얼 노벨",
  "샌드박스",
  "공상과학",
  "전투",
  "액션 어드벤처",
  "사이버펑크",
  "액션 RPG",
  "도시 건설",
  "JRPG",
  "CRPG",
  "파밍",
  "농장 시뮬레이션",
  "전쟁 게임",
  "경제",
  "경영",
  "시간 관리",
  "생활 시뮬레이션",
  "연애 시뮬레이션",
  "걷기 시뮬레이션",
  "직업 시뮬레이션",
  "우주 시뮬레이션",
  "정치 시뮬레이션",
  "농업",
  "덱빌딩",
  "배틀 로얄",
  "소울라이크",
  "텍스트 기반",
  "전략 RPG",
  "전술 RPG",
  "무협",
  "VR",
  "파티",
  "파티 게임",
  "로봇",
  "좀비",
  "타자",
  "차량 전투",
  "레벨 에디터",
  "터치 친화적",
  "히어로 슈팅",
  "익스트랙션 슈터",
  "아레나 슈팅",
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
}>) {
  const item = items[index];
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  const star = starMap[item.appid];
  const starPopoverRef = useRef<HTMLDivElement>(null);
  const achievement = achievementMap[item.appid];
  const checkingAchievement = checkingAchievements.has(item.appid);
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
      {manual && (
        <div className="rowBadges">
          <span className="rowBadge manual">
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
        </div>
      )}
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
          {view === "library" && (
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
        </div>
        <p className="meta">{g?.genres.slice(0, 3).join(" · ") || "게임 정보 불러오는 중"}</p>
        <div className="badges">
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
          {view === "wishlist" && g?.reviewPositive != null ? (
            <span className={"chip " + scoreClass(g.reviewPositive)} title="Steam 리뷰 긍정 비율">
              리뷰 {g.reviewPositive}%
            </span>
          ) : null}
          {item.playtimeMinutes != null ? (
            <span className="chip">플레이타임 {(item.playtimeMinutes / 60).toFixed(1)}시간</span>
          ) : null}
          {achievement != null ? (
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
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                className={"statusChip " + (status === s ? "active" : "")}
                onClick={() => onSetStatus(item.appid, status === s ? null : s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            <span className="ratingChips">
              {(["like", "dislike"] as const).map((r) => (
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
        {view === "wishlist" && (g?.metacritic != null || g?.reviewPositive != null) ? (
          <div className="cardBadges cardBadgesBottomRight">
            {g.metacritic != null ? (
              <span className={"cardBadge " + scoreClass(g.metacritic)}>메타 {g.metacritic}</span>
            ) : null}
            {g.reviewPositive != null ? (
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
            {status && <span className="cardBadge status">{STATUS_LABELS[status]}</span>}
            {star && (
              <span className="cardBadge stars">
                <StarGlyph />
                {star}
              </span>
            )}
            {rating && <span className="cardBadge">{RATING_EMOJI[rating]}</span>}
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
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="filterGroup">
      <div className="sortLabel fieldToggle" onClick={onToggle}>
        {title}
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
    { appid: number; name: string; image: string | null }[]
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
  const missingInitial = appids.filter((id) => !(id in loaded));
  for (let i = 0; i < missingInitial.length; i += CHUNK) {
    const newGames = await fetchChunk(missingInitial.slice(i, i + CHUNK));
    if (!newGames) continue;
    loaded = { ...loaded, ...newGames };
    onProgress(loaded);
  }
  // Only one short retry: some appids (delisted, tools, soundtracks, redirected listings) never
  // resolve no matter how many times you ask, and IStoreBrowseService hasn't shown any sign of
  // being rate-limited in practice - so there's nothing to gain from hammering it further.
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
  function persistManual(
    platformValue: Record<number, ManualPlatform>,
    gamesValue: Record<number, Game>,
  ) {
    try {
      localStorage.setItem(MANUAL_PLATFORM_STORAGE_KEY, JSON.stringify(platformValue));
      localStorage.setItem(MANUAL_GAMES_STORAGE_KEY, JSON.stringify(gamesValue));
    } catch {}
  }
  // A library refresh only ever touches libItems/libGames (the Steam-fetched half), so merging
  // manual entries in here - rather than mixing them into libItems itself - means they survive
  // every "라이브러리 가져오기" click instead of being wiped by it.
  const combinedLibItems: Item[] = useMemo(
    () => [...libItems, ...Object.keys(manualPlatform).map((id) => ({ appid: Number(id) }))],
    [libItems, manualPlatform],
  );
  const combinedLibGames = useMemo(
    () => ({ ...libGames, ...manualGames }),
    [libGames, manualGames],
  );
  // Uses GENRE_LEVEL_ALLOWLIST, not the filter's broader GENRE_ALLOWLIST - see the comment on that
  // constant. Manual entries have no playtimeMinutes (never actually tracked by Steam), so they
  // silently contribute nothing - only real owned-and-played games level up a genre.
  const genreXp = useMemo(() => {
    const xp: Record<string, number> = {};
    for (const item of combinedLibItems) {
      const minutes = item.playtimeMinutes;
      if (!minutes) continue;
      const g = combinedLibGames[item.appid];
      for (const genre of g?.genres ?? []) {
        if (!GENRE_LEVEL_ALLOWLIST.has(genre)) continue;
        xp[genre] = (xp[genre] ?? 0) + minutes / 60;
      }
    }
    return xp;
  }, [combinedLibItems, combinedLibGames]);
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
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
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  function toggleGenre(genre: string) {
    setGenreFilter((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
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
    const counts: Record<string, number> = {};
    for (const item of items) {
      for (const genre of games[item.appid]?.genres ?? []) {
        if (!GENRE_ALLOWLIST.has(genre)) continue;
        counts[genre] = (counts[genre] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, GENRE_FILTER_LIMIT);
  }, [items, games]);
  const genreLevels = useMemo(
    () =>
      Object.entries(genreXp)
        .map(([genre, hours]) => ({ genre, hours, ...genreLevelInfo(hours) }))
        .sort((a, b) => b.hours - a.hours),
    [genreXp],
  );
  // Genre levels are always computed from the library, regardless of which tab is open - so show
  // them on the wishlist tab too, but only when it's tracking the same account as the library.
  // Otherwise the badge would show *your* library's genre level next to a friend's wishlist
  // profile (wishlist and library intentionally support different steamIds - see their comment).
  const showGenreLevels =
    genreLevels.length > 0 && (view === "library" || wlSteamId === libSteamId);
  // Fine-grained GENRE_ALLOWLIST, not the coarse GENRE_LEVEL_ALLOWLIST - subgenre distinctions
  // like JRPG vs CRPG vs 액션 RPG matter here, unlike for the level badge where they'd just dilute
  // one bucket. A genre only surfaces once it's crossed TASTE_MIN_GAMES games, so a couple of
  // flukes (one dropped game, one over-generous 5-star) can't swing a tiny-sample average.
  const genreTaste = useMemo(() => {
    const gameCounts: Record<string, number> = {};
    const hoursByGenre: Record<string, number> = {};
    const weightedByGenre: Record<string, number> = {};
    for (const item of combinedLibItems) {
      const hours = (item.playtimeMinutes ?? 0) / 60;
      if (!hours) continue;
      const g = combinedLibGames[item.appid];
      const affinity = gameAffinity(
        statusMap[item.appid],
        ratingMap[item.appid],
        starMap[item.appid],
        achievementMap[item.appid],
      );
      for (const genre of g?.genres ?? []) {
        if (!GENRE_ALLOWLIST.has(genre)) continue;
        gameCounts[genre] = (gameCounts[genre] ?? 0) + 1;
        hoursByGenre[genre] = (hoursByGenre[genre] ?? 0) + hours;
        weightedByGenre[genre] = (weightedByGenre[genre] ?? 0) + hours * affinity;
      }
    }
    return Object.entries(gameCounts)
      .filter(([, count]) => count >= TASTE_MIN_GAMES)
      .map(([genre, count]) => ({
        genre,
        games: count,
        affinity: weightedByGenre[genre] / hoursByGenre[genre],
      }))
      .sort((a, b) => b.affinity - a.affinity);
  }, [combinedLibItems, combinedLibGames, statusMap, ratingMap, starMap, achievementMap]);
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
      if (genreFilter.length && !genreFilter.some((genre) => g?.genres.includes(genre)))
        return false;
      if (view === "library" && statusFilter.length) {
        const s = statusMap[item.appid] ?? "none";
        if (!statusFilter.includes(s)) return false;
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
    () => sortItems(filteredItems, games, sortKey, achievementMap),
    [filteredItems, games, sortKey, achievementMap],
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
      const loaded = await enrichGames(appids, existing, (cur) => {
        setWlGames(cur);
        setWlProgress({ done: Object.keys(cur).length, total: list.length });
        persistWishlistThrottled(list, cur);
      });
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
      const list: Item[] = (d.items ?? []).map((x: { appid: number; playtimeMinutes: number }) => ({
        appid: x.appid,
        playtimeMinutes: x.playtimeMinutes,
      }));
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
      const loaded = await enrichGames(appids, existing, (cur) => {
        setLibGames(cur);
        setLibProgress({ done: Object.keys(cur).length, total: list.length });
        persistLibraryThrottled(list, cur);
      });
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
                    선호 장르
                  </button>
                )}
              </div>
              {genreTab === "level" && (
                <div className="genreChartScroll">
                  {(() => {
                    const maxHours = genreLevels[0]?.hours || 1;
                    return genreLevels.map(({ genre, hours, level }) => (
                      <div
                        key={genre}
                        className="chartRow"
                        title={`${genre} · Lv.${level} · ${Math.round(hours)}시간`}
                      >
                        <span className="chartLabel">{genre}</span>
                        <div className="chartTrack">
                          <i
                            className="chartBar"
                            style={{ width: `${(hours / maxHours) * 100}%` }}
                          />
                        </div>
                        <span className="chartValue">Lv.{level}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
              {genreTab === "taste" && genreTaste.length > 0 && (
                <>
                  <div className="genreTasteHint">실험적 기능 - 위시리스트 추천에 활용 예정</div>
                  <div className="genreChartScroll">
                    {genreTaste.map(({ genre, games, affinity }) => {
                      const pct = Math.round((affinity - 1) * 100);
                      const barPct =
                        (Math.min(Math.abs(pct), TASTE_PCT_DOMAIN) / TASTE_PCT_DOMAIN) * 100;
                      return (
                        <div
                          key={genre}
                          className="divergeRow"
                          title={`${genre} · ${games}개 게임 · ${pct >= 0 ? "+" : ""}${pct}%`}
                        >
                          <span className="chartLabel">{genre}</span>
                          <div className="divergeTrack">
                            <div className="divergeHalf bad">
                              {pct < 0 && (
                                <i className="divergeBar bad" style={{ width: `${barPct}%` }} />
                              )}
                            </div>
                            <div className="divergeCenter" />
                            <div className="divergeHalf good">
                              {pct >= 0 && (
                                <i className="divergeBar good" style={{ width: `${barPct}%` }} />
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
          >
            {(view === "wishlist" ? WISHLIST_SORT_OPTIONS : LIBRARY_SORT_OPTIONS).map((opt) => (
              <label key={opt.value} className="sortCheck">
                <input
                  type="radio"
                  name="sortKey"
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
            >
              <label className="sortCheck">
                <input
                  type="radio"
                  name="koreanFilter"
                  checked={koreanFilter === "supported"}
                  onChange={() => selectKoreanFilter("supported")}
                />
                한국어 지원 ({koreanCounts.supported})
              </label>
              <label className="sortCheck">
                <input
                  type="radio"
                  name="koreanFilter"
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
            >
              {genreCounts.map(([genre, count]) => (
                <label key={genre} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={genreFilter.includes(genre)}
                    onChange={() => toggleGenre(genre)}
                  />
                  {genre} ({count})
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
              ⟳
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
