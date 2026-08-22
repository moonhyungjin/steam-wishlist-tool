"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { List, type RowComponentProps } from "react-window";
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
  | "playtime-desc"
  | "achievement-desc"
  | "name-asc";
const WISHLIST_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "price-asc", label: "가격 낮은순" },
  { value: "review", label: "긍정 비율 높은순" },
  { value: "metacritic", label: "메타크리틱 높은순" },
  { value: "release-desc", label: "출시일 최신순" },
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
const STEAM_ID_STORAGE_KEY = "steam:id";
// Bump this whenever the Game shape changes - otherwise old cached entries silently keep
// missing the new fields forever, since "resume from cache" treats them as already loaded.
const CACHE_VERSION = 9;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Fixed row slot for the virtualized list: the row content renders at ROW_HEIGHT - ROW_GAP,
// leaving ROW_GAP of empty space below it as the visual gap between rows.
const ROW_HEIGHT = 146;
const ROW_GAP = 10;
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
function useElementHeight() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setHeight(entries[0].contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
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
}>) {
  const item = items[index];
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  const achievement = achievementMap[item.appid];
  const checkingAchievement = checkingAchievements.has(item.appid);
  return (
    <article className="game" style={{ ...style, height: ROW_HEIGHT - ROW_GAP }}>
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
            ↗
          </a>
        </h3>
        <p className="meta">{g?.genres.slice(0, 3).join(" · ") || "게임 정보 불러오는 중"}</p>
        <div className="badges">
          {view === "wishlist" && g?.price && <span className="chip">{g.price}</span>}
          {view === "wishlist" && g?.discountPercent ? (
            <span className="chip discount">-{g.discountPercent}%</span>
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
        {view === "wishlist" && g?.releaseDate ? (
          <p className="meta">출시일 {g.releaseDate}</p>
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
  const [steamId, setSteamId] = useState("76561198305317064");
  const [apiKey, setApiKey] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  // Profile lookup needs a Steam Web API key (same one the library tab collects) - there's no
  // key-free way to get an avatar/name, so this just stays empty until one's been entered,
  // regardless of which tab that happened on.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!/^\d{17}$/.test(steamId.trim()) || !apiKey.trim()) {
        if (!cancelled) setProfile(null);
        return;
      }
      try {
        const r = await fetch(
          `/api/profile?steamid=${encodeURIComponent(steamId.trim())}&key=${encodeURIComponent(apiKey.trim())}`,
        );
        const d = await r.json();
        if (!cancelled && r.ok) setProfile(d.profile ?? null);
      } catch {}
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [steamId, apiKey]);

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

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  function selectSortKey(key: SortKey) {
    setSortKey((prev) => (prev === key ? null : key));
  }
  function switchView(next: View) {
    setView(next);
    setSortKey(null);
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
    setStatusMap((prev) => {
      const next = { ...prev };
      if (status) next[appid] = status;
      else delete next[appid];
      try {
        localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
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
    setRatingMap((prev) => {
      const next = { ...prev };
      if (rating) next[appid] = rating;
      else delete next[appid];
      try {
        localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
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
  function updateAchievements(next: Record<number, AchievementInfo | null>) {
    setAchievementMap(next);
    try {
      localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }
  const [checkingAchievements, setCheckingAchievements] = useState<Set<number>>(() => new Set());
  // Lets a single row jump the queue instead of waiting for its turn in the slow background pass.
  async function checkOneAchievement(appid: number) {
    if (checkingAchievements.has(appid) || !steamId.trim() || !apiKey.trim()) return;
    setCheckingAchievements((prev) => new Set(prev).add(appid));
    try {
      const r = await fetch(
        `/api/achievements?steamid=${encodeURIComponent(steamId.trim())}&key=${encodeURIComponent(apiKey.trim())}&appids=${appid}`,
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
  const [listWrapRef, listHeight] = useElementHeight();
  // One-time hydration from localStorage on mount; SSR has no localStorage, so this must run in an effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(API_KEY_STORAGE_KEY) ?? "");
      const savedId = localStorage.getItem(STEAM_ID_STORAGE_KEY);
      if (savedId) setSteamId(savedId);
      const wl = JSON.parse(localStorage.getItem(WISHLIST_CACHE_KEY) ?? "null");
      if (!savedId && wl?.steamId) setSteamId(wl.steamId);
      if (wl?.version === CACHE_VERSION && Array.isArray(wl?.items)) {
        setWlItems(wl.items);
        setWlProgress({ done: wl.items.length, total: wl.items.length });
        if (wl.games) setWlGames(wl.games);
      }
      const lib = JSON.parse(localStorage.getItem(LIBRARY_CACHE_KEY) ?? "null");
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
    } catch {}
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  function persistTo(cacheKey: string, itemsValue: Item[], gamesValue: Record<number, Game>) {
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ version: CACHE_VERSION, steamId, items: itemsValue, games: gamesValue }),
      );
    } catch {}
  }
  const lastWlPersistAt = useRef(0);
  const lastLibPersistAt = useRef(0);
  function persistWishlistThrottled(itemsValue: Item[], gamesValue: Record<number, Game>) {
    const now = Date.now();
    if (now - lastWlPersistAt.current < 1500) return;
    lastWlPersistAt.current = now;
    persistTo(WISHLIST_CACHE_KEY, itemsValue, gamesValue);
  }
  function persistLibraryThrottled(itemsValue: Item[], gamesValue: Record<number, Game>) {
    const now = Date.now();
    if (now - lastLibPersistAt.current < 1500) return;
    lastLibPersistAt.current = now;
    persistTo(LIBRARY_CACHE_KEY, itemsValue, gamesValue);
  }
  async function loadWishlist() {
    if (!/^\d{17}$/.test(steamId.trim())) {
      setWlError("17자리 Steam ID64를 입력하세요.");
      return;
    }
    setWlLoading(true);
    setWlError("");
    try {
      const r = await fetch(`/api/wishlist?steamid=${encodeURIComponent(steamId.trim())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const list: Item[] = (d.items ?? []).map((x: { appid: number }) => ({ appid: x.appid }));
      setWlItems(list);
      const listAppids = new Set(list.map((x) => x.appid));
      const existing: Record<number, Game> = {};
      for (const [id, g] of Object.entries(wlGames)) {
        if (listAppids.has(Number(id))) existing[Number(id)] = g;
      }
      setWlGames(existing);
      setWlProgress({ done: Object.keys(existing).length, total: list.length });
      persistTo(WISHLIST_CACHE_KEY, list, existing);
      const appids = list.map((x) => x.appid);
      const loaded = await enrichGames(appids, existing, (cur) => {
        setWlGames(cur);
        setWlProgress({ done: Object.keys(cur).length, total: list.length });
        persistWishlistThrottled(list, cur);
      });
      persistTo(WISHLIST_CACHE_KEY, list, loaded);
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
    if (!/^\d{17}$/.test(steamId.trim())) {
      setLibError("17자리 Steam ID64를 입력하세요.");
      return;
    }
    if (!apiKey.trim()) {
      setLibError("Steam API 키를 입력하세요.");
      return;
    }
    setLibLoading(true);
    setLibError("");
    try {
      const r = await fetch(
        `/api/library?steamid=${encodeURIComponent(steamId.trim())}&key=${encodeURIComponent(apiKey.trim())}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.error) throw new Error(d.error);
      const list: Item[] = (d.items ?? []).map((x: { appid: number; playtimeMinutes: number }) => ({
        appid: x.appid,
        playtimeMinutes: x.playtimeMinutes,
      }));
      setLibItems(list);
      const listAppids = new Set(list.map((x) => x.appid));
      const existing: Record<number, Game> = {};
      for (const [id, g] of Object.entries(libGames)) {
        if (listAppids.has(Number(id))) existing[Number(id)] = g;
      }
      setLibGames(existing);
      setLibProgress({ done: Object.keys(existing).length, total: list.length });
      persistTo(LIBRARY_CACHE_KEY, list, existing);
      const appids = list.map((x) => x.appid);
      const loaded = await enrichGames(appids, existing, (cur) => {
        setLibGames(cur);
        setLibProgress({ done: Object.keys(cur).length, total: list.length });
        persistLibraryThrottled(list, cur);
      });
      persistTo(LIBRARY_CACHE_KEY, list, loaded);
      enrichMetacritic(appids, loaded, (cur) => {
        setLibGames(cur);
        persistLibraryThrottled(list, cur);
      }).catch(() => {});
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
      enrichAchievements(
        achievementOrder,
        steamId.trim(),
        apiKey.trim(),
        achievementMap,
        updateAchievements,
      ).catch(() => {});
    } catch (e) {
      setLibError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLibLoading(false);
    }
  }
  const loadActive = view === "wishlist" ? loadWishlist : loadLibrary;
  // No more manual "fetch" button - switching to a tab (or finishing typing valid credentials)
  // loads that tab's data automatically, as long as it isn't already loaded/cached and hasn't
  // already failed (that's what the "다시 시도" button next to the error is for instead, so a
  // bad ID/key doesn't retry itself in a loop on every keystroke).
  useEffect(() => {
    if (loading) return;
    const idValid = /^\d{17}$/.test(steamId.trim());
    const shouldLoadWishlist = view === "wishlist" && idValid && wlItems.length === 0 && !wlError;
    const shouldLoadLibrary =
      view === "library" && idValid && !!apiKey.trim() && libItems.length === 0 && !libError;
    if (!shouldLoadWishlist && !shouldLoadLibrary) return;
    const timer = setTimeout(() => {
      if (shouldLoadWishlist) loadWishlist();
      else if (shouldLoadLibrary) loadLibrary();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, steamId, apiKey, wlItems.length, libItems.length, wlError, libError, loading]);
  // "Logged in" tracks the profile fetch specifically (not just non-empty fields) since that's
  // the one signal that both the ID and key actually check out together against Steam's API.
  const loggedIn = profile !== null;
  function logout() {
    setSteamId("");
    setApiKey("");
    setProfile(null);
    setWlItems([]);
    setWlGames({});
    setWlProgress({ done: 0, total: 0 });
    setWlError("");
    setLibItems([]);
    setLibGames({});
    setLibProgress({ done: 0, total: 0 });
    setLibError("");
    setAchievementMap({});
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      localStorage.removeItem(STEAM_ID_STORAGE_KEY);
      localStorage.removeItem(WISHLIST_CACHE_KEY);
      localStorage.removeItem(LIBRARY_CACHE_KEY);
      localStorage.removeItem(ACHIEVEMENT_STORAGE_KEY);
    } catch {}
  }
  return (
    <div className="page">
      <aside className="sidebar">
        <header>
          <p className="eyebrow">PERSONAL STEAM TOOL</p>
          <h1>{view === "wishlist" ? "My Steam Wishlist" : "My Steam Library"}</h1>
          {profile && (
            <div className="profileRow">
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
              <button type="button" className="logoutBtn" onClick={logout}>
                로그아웃
              </button>
            </div>
          )}
        </header>
        {!loggedIn && (
          <section className="panel form">
            <div className="row">
              <div className="field">
                <label>
                  My Steam 로그인
                  <span
                    className="helpIcon"
                    title="Steam ID64는 프로필 페이지 URL의 숫자입니다 (steamcommunity.com/profiles/76561198xxxxxxxxx 형태). 커스텀 URL(steamcommunity.com/id/닉네임)이면 steamid.io 같은 사이트에서 변환하세요. Steam API 키는 steamcommunity.com/dev/apikey 에서 발급받으세요 (Domain Name엔 아무거나 입력, 예: localhost). 개인정보 설정에서 '게임 세부정보'가 공개여야 라이브러리를 가져올 수 있습니다."
                  >
                    ?
                  </span>
                </label>
                <input
                  value={steamId}
                  onChange={(e) => {
                    setSteamId(e.target.value);
                    try {
                      localStorage.setItem(STEAM_ID_STORAGE_KEY, e.target.value);
                    } catch {}
                  }}
                  placeholder="Steam ID64"
                  onKeyDown={(e) => e.key === "Enter" && loadActive()}
                />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    try {
                      localStorage.setItem(API_KEY_STORAGE_KEY, e.target.value);
                    } catch {}
                  }}
                  placeholder="Steam API 키"
                  onKeyDown={(e) => e.key === "Enter" && loadActive()}
                />
              </div>
            </div>
          </section>
        )}
        {loggedIn && (
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
        )}
        {error && (
          <section className="error">
            {error}
            <button type="button" className="retryBtn" onClick={loadActive} disabled={loading}>
              {loading ? "다시 시도 중..." : "다시 시도"}
            </button>
          </section>
        )}
        {loggedIn && (
          <section className="panel filterPanel">
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
                <label className="sortCheck">
                  <input
                    type="checkbox"
                    checked={excludeAdult}
                    onChange={() => setExcludeAdult((v) => !v)}
                  />
                  선정적 콘텐츠 제외
                </label>
                <label className="sortCheck">
                  <input
                    type="checkbox"
                    checked={demoOnly}
                    onChange={() => setDemoOnly((v) => !v)}
                  />
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
        )}
      </aside>
      <main className="mainArea">
        <div className="sectionHead">
          <h2>{view === "wishlist" ? "Wishlist" : "Library"}</h2>
          <input
            className="searchInput"
            type="text"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="게임 이름 검색"
          />
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
              {view === "wishlist" ? "찜목록" : "보유 게임"} {filteredItems.length} / {items.length}
              개
            </span>
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
          ) : listHeight > 0 ? (
            <List
              className="gameList"
              rowComponent={GameRow}
              rowCount={sortedItems.length}
              rowHeight={ROW_HEIGHT}
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
              }}
              style={{ height: listHeight, width: "100%" }}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
