"use client";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
type PlayStatus = "planned" | "playing" | "completed" | "incomplete" | "dropped";
const STATUS_LABELS: Record<PlayStatus, string> = {
  planned: "예정",
  playing: "진행중",
  completed: "완료",
  incomplete: "미완료",
  dropped: "하차",
};
const STATUS_ORDER: PlayStatus[] = ["planned", "playing", "completed", "incomplete", "dropped"];
const STATUS_STORAGE_KEY = "library:status";
type Rating = "like" | "dislike";
const RATING_EMOJI: Record<Rating, string> = { like: "👍", dislike: "👎" };
const RATING_LABELS: Record<Rating, string> = { like: "좋아요", dislike: "싫어요" };
const RATING_STORAGE_KEY = "library:rating";
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
    excludeAdult: boolean;
    demoOnly: boolean;
    statusMap: Record<number, PlayStatus>;
    ratingMap: Record<number, Rating>;
  },
): number[] {
  const q = filters.nameQuery.trim().toLowerCase();
  function matches(item: Item): boolean {
    const g = loaded[item.appid];
    if (q && !(g?.name ?? "").toLowerCase().includes(q)) return false;
    if (filters.excludeAdult && g?.adultContent) return false;
    if (filters.demoOnly && !g?.isDemo) return false;
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
  achievementMap,
  checkingAchievements,
  onCheckAchievement,
  rowHeight,
}: RowComponentProps<{
  items: Item[];
  games: Record<number, Game>;
  view: View;
  statusMap: Record<number, PlayStatus>;
  onSetStatus: (appid: number, status: PlayStatus | null) => void;
  ratingMap: Record<number, Rating>;
  onSetRating: (appid: number, rating: Rating | null) => void;
  achievementMap: Record<number, AchievementInfo | null>;
  checkingAchievements: Set<number>;
  onCheckAchievement: (appid: number) => void;
  rowHeight: number;
}>) {
  const item = items[index];
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  const achievement = achievementMap[item.appid];
  const checkingAchievement = checkingAchievements.has(item.appid);
  return (
    <article className="game" style={{ ...style, height: rowHeight - ROW_GAP }}>
      <a
        className="cover"
        href={`https://store.steampowered.com/app/${item.appid}`}
        target="_blank"
        rel="noopener noreferrer"
        title={
          view === "library"
            ? "Steam 라이브러리에서 열기 (Steam 미설치 시 상점 페이지)"
            : "스팀 상점 페이지 열기"
        }
        onClick={(e) => {
          if (view !== "library" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
      <div className="info">
        <h3>
          {g?.name ?? `Steam App ${item.appid}`}
          <a
            className="storeLink"
            href={`https://store.steampowered.com/app/${item.appid}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (view !== "library" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              openLibraryOrStore(item.appid);
            }}
            title={
              view === "library"
                ? "Steam 라이브러리에서 열기 (Steam 미설치 시 상점 페이지)"
                : "스팀 상점 페이지 열기"
            }
          >
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
        </h3>
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
            <span className={"chip " + scoreClass(achievement.percent)} title="업적 달성률">
              업적 {achievement.percent}% ({achievement.achieved}/{achievement.total})
            </span>
          ) : view === "library" && achievement === undefined ? (
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
          {g ? (
            <span
              className={"chip " + (g.koreanSupported ? "good" : "bad")}
              title="인터페이스/자막/더빙 중 하나라도 한국어를 지원하는지 여부"
            >
              {g.koreanSupported ? "한국어 지원" : "한국어 미지원"}
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
}: CellComponentProps<{
  items: Item[];
  games: Record<number, Game>;
  view: View;
  columnCount: number;
  statusMap: Record<number, PlayStatus>;
  ratingMap: Record<number, Rating>;
}>) {
  const index = rowIndex * columnCount + columnIndex;
  const item = items[index];
  if (!item) return <div style={style} />;
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  return (
    <div style={style} className="cardCellOuter">
      <a
        className="card"
        href={`https://store.steampowered.com/app/${item.appid}`}
        target="_blank"
        rel="noopener noreferrer"
        title={g?.name ?? `Steam App ${item.appid}`}
      >
        <div className="cardCover">
          {g?.headerImage ? (
            <img src={g.headerImage} alt="" loading="lazy" decoding="async" />
          ) : (
            <div className="loadingCover">LOADING</div>
          )}
          {view === "wishlist" && (g?.metacritic != null || g?.reviewPositive != null) ? (
            <div className="cardBadges">
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
          {view === "library" && (status || rating) ? (
            // Display-only - this sits inside the whole-card link, so it must never be
            // clickable (a click here would both toggle it and navigate away).
            <div className="cardBadges">
              {status && <span className="cardBadge status">{STATUS_LABELS[status]}</span>}
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
      </a>
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

  const [libItems, setLibItems] = useState<Item[]>([]);
  const [libGames, setLibGames] = useState<Record<number, Game>>({});
  const [libLoading, setLibLoading] = useState(false);
  const [libProgress, setLibProgress] = useState({ done: 0, total: 0 });
  const [libError, setLibError] = useState("");

  const items = view === "wishlist" ? wlItems : libItems;
  const games = view === "wishlist" ? wlGames : libGames;
  const loading = view === "wishlist" ? wlLoading : libLoading;
  const progress = view === "wishlist" ? wlProgress : libProgress;
  const error = view === "wishlist" ? wlError : libError;
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
  const [koreanFilter, setKoreanFilter] = useState<("supported" | "unsupported")[]>([]);
  function toggleKoreanFilter(v: "supported" | "unsupported") {
    setKoreanFilter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }
  const [excludeAdult, setExcludeAdult] = useState(false);
  const [demoOnly, setDemoOnly] = useState(false);
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
        new Set(["discount", "korean", "libraryFilter", "status", "rating", "sort", "genre"]),
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
      planned: 0,
      playing: 0,
      completed: 0,
      incomplete: 0,
      dropped: 0,
      none: 0,
    };
    for (const item of libItems) {
      const s = statusMap[item.appid];
      counts[s ?? "none"]++;
    }
    return counts;
  }, [libItems, statusMap]);
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
    for (const item of libItems) {
      const r = ratingMap[item.appid];
      counts[r ?? "none"]++;
    }
    return counts;
  }, [libItems, ratingMap]);
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
  const filteredItems = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return items.filter((item) => {
      const g = games[item.appid];
      if (q && !(g?.name ?? "").toLowerCase().includes(q)) return false;
      if (view === "wishlist" && onlyDiscounted && !(g && g.discountPercent > 0)) return false;
      if (view === "wishlist" && excludeEarlyAccess && g?.earlyAccess) return false;
      if (view === "wishlist" && excludeComingSoon && g?.comingSoon) return false;
      if (view === "wishlist" && koreanFilter.length) {
        const k = g?.koreanSupported ? "supported" : "unsupported";
        if (!koreanFilter.includes(k)) return false;
      }
      if (view === "library" && excludeAdult && g?.adultContent) return false;
      if (view === "library" && demoOnly && !g?.isDemo) return false;
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
    demoOnly,
    genreFilter,
    view,
    statusFilter,
    statusMap,
    ratingFilter,
    ratingMap,
  ]);
  const sortedItems = useMemo(
    () => sortItems(filteredItems, games, sortKey, achievementMap),
    [filteredItems, games, sortKey, achievementMap],
  );
  // Drives the mobile filter button's active state - the drawer hides the checkboxes themselves,
  // so this is the only visible sign a filter is narrowing the list down.
  const hasActiveFilter =
    genreFilter.length > 0 ||
    (view === "wishlist"
      ? onlyDiscounted || excludeEarlyAccess || excludeComingSoon || koreanFilter.length > 0
      : excludeAdult || demoOnly || statusFilter.length > 0 || ratingFilter.length > 0);
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
      const status = JSON.parse(localStorage.getItem(STATUS_STORAGE_KEY) ?? "null");
      if (status && typeof status === "object") setStatusMap(status);
      const rating = JSON.parse(localStorage.getItem(RATING_STORAGE_KEY) ?? "null");
      if (rating && typeof rating === "object") setRatingMap(rating);
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
    const now = Date.now();
    if (now - lastLibPersistAt.current < 1500) return;
    lastLibPersistAt.current = now;
    persistTo(LIBRARY_CACHE_KEY, libSteamId, itemsValue, gamesValue);
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
        excludeAdult,
        demoOnly,
        statusMap,
        ratingMap,
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
      <aside className="sidebar">
        <header>
          <p className="eyebrow">PERSONAL STEAM TOOL</p>
          <h1>{view === "wishlist" ? "My Steam Wishlist" : "My Steam Library"}</h1>
          {(profile || !formVisible) && (
            <div className="profileRow">
              {profile && (
                <a
                  className="profileCard"
                  href={profile.profileUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Steam 프로필 열기"
                >
                  {profile.avatarUrl && (
                    <img className="profileAvatar" src={profile.avatarUrl} alt="" />
                  )}
                  <span className="profileName">{profile.personaName}</span>
                </a>
              )}
              {!formVisible && (
                <button type="button" className="smallBtn" onClick={openCredsForm}>
                  계정 변경
                </button>
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
              ✕
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
          {view === "wishlist" && (
            <FilterGroup
              title="한국어"
              collapsed={collapsedGroups.has("korean")}
              onToggle={() => toggleGroup("korean")}
            >
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={koreanFilter.includes("supported")}
                  onChange={() => toggleKoreanFilter("supported")}
                />
                한국어 지원 ({koreanCounts.supported})
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={koreanFilter.includes("unsupported")}
                  onChange={() => toggleKoreanFilter("unsupported")}
                />
                한국어 미지원 ({koreanCounts.unsupported})
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
                <input type="checkbox" checked={demoOnly} onChange={() => setDemoOnly((v) => !v)} />
                데모만 보기
              </label>
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
              title="평가"
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
          <FilterGroup
            title="정렬 (하나만 선택)"
            collapsed={collapsedGroups.has("sort")}
            onToggle={() => toggleGroup("sort")}
          >
            {(view === "wishlist" ? WISHLIST_SORT_OPTIONS : LIBRARY_SORT_OPTIONS).map((opt) => (
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
            {loading && progress.total > 0 && (
              <div
                className="miniProgress"
                title={`게임 정보 불러오는 중 ${progress.done} / ${progress.total}`}
              >
                <span>
                  {progress.done} / {progress.total}
                </span>
                <div className="miniBar">
                  <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              </div>
            )}
            <span className="itemCount">
              <span className="itemCountLabel">
                {view === "wishlist" ? "찜목록" : "보유 게임"}{" "}
              </span>
              {filteredItems.length} / {items.length}개
            </span>
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
        <div className="listWrap" ref={listWrapRef}>
          {!items.length ? (
            <div className="empty">
              {view === "wishlist"
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
                achievementMap,
                checkingAchievements,
                onCheckAchievement: checkOneAchievement,
                rowHeight: isMobile ? MOBILE_ROW_HEIGHT : ROW_HEIGHT,
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
                  cellProps={{ items: sortedItems, games, view, columnCount, statusMap, ratingMap }}
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
