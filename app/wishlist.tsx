"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Grid, List } from "react-window";
import { DEFAULT_COUNTRY, isSupportedCountry } from "./countries";
import { type Item, type View, type Profile, type Game, type AchievementInfo } from "./types";
import {
  lowestPriceStatus,
  genreLevelInfo,
  sortItems,
  prioritizeAchievementOrder,
  mergeGamesInto,
  computeGenreXp,
  computeGenreBreakdown,
  computeGenreTaste,
  computeRecommendFit,
} from "./gameLogic";
import {
  STATUS_STORAGE_KEY,
  RATING_STORAGE_KEY,
  STAR_VALUES,
  STAR_STORAGE_KEY,
  ACHIEVEMENT_STORAGE_KEY,
  ACHIEVEMENT_REFRESH_RECENT_COUNT,
  WISHLIST_CACHE_KEY,
  LIBRARY_CACHE_KEY,
  STEAM_ID_STORAGE_KEY,
  MANUAL_PLATFORM_STORAGE_KEY,
  MANUAL_GAMES_STORAGE_KEY,
  MANUAL_PLAYTIME_STORAGE_KEY,
  COUNTRY_STORAGE_KEY,
  CACHE_VERSION,
  ROW_HEIGHT,
  MOBILE_ROW_HEIGHT,
  CARD_MIN_WIDTH,
  CARD_NARROW_BREAKPOINT,
  CARD_ROW_HEIGHT,
} from "./constants";
import {
  GENRE_LEVELING_ENABLED,
  GENRE_LEVELS_MIN_GAMES,
  GENRE_LEVELS_MIN_HOURS,
  GENRE_FILTER_LIMIT,
  GENRE_ALLOWLIST_IDS,
} from "./genres";
import { useElementSize } from "./hooks";
import { useFilterState } from "./useFilterState";
import { useSyncedData } from "./useSyncedData";
import { usePoll } from "./usePoll";
import { useRefreshStamp } from "./useRefreshStamp";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { PollBar } from "./components/PollBar";
import { GameRow } from "./components/GameRow";
import { CardCell } from "./components/CardCell";
import { CountryPanel } from "./components/CountryPanel";
import { SyncPanel } from "./components/SyncPanel";
import { MyPollsPanel } from "./components/MyPollsPanel";
import { ManualAddPanel } from "./components/ManualAddPanel";
import { enrichGames, enrichMetacritic, enrichLowestPrice, enrichAchievements } from "./enrich";
export default function Wishlist() {
  const [view, setView] = useState<View>("wishlist");
  // Shared across both tabs - one Steam account, viewed two ways.
  const [steamId, setSteamId] = useState("");
  const {
    syncLink,
    linkSyncCode,
    manualPlatform,
    setManualPlatform,
    manualGames,
    setManualGames,
    manualPlaytime,
    setManualPlaytime,
    statusMap,
    setStatusMap,
    ratingMap,
    setRatingMap,
    starMap,
    setStarMap,
    achievementMap,
    setAchievementMap,
    setManualPlaytimeHours,
    setGameStatus,
    setGameRating,
    setGameStar,
    addManualGame,
    removeManualGame,
    resetPerAccountStateIfIdChanged,
    syncFromServer,
    updateAchievements,
    activeSyncIdRef,
  } = useSyncedData(steamId);
  // Everything tied to the previous account besides the synced maps - passed to
  // resetPerAccountStateIfIdChanged so the old avatar/name doesn't linger while the new profile loads.
  function clearProfileForAccountChange() {
    setProfile(null);
    setProfileError("");
  }
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  // Reopens the credential form after data's already loaded for this tab (it auto-hides on
  // success) so the user can switch accounts or re-enter a key without a dedicated logout step.
  const [editingCreds, setEditingCreds] = useState(false);
  function openCredsForm() {
    // "이 정보 저장" being off at the last fetch means the id was a one-time thing, not something
    // to keep showing back - clear the field so reopening the form to switch accounts starts blank
    // instead of silently re-offering the id that was just told not to be remembered.
    if (!rememberMe) setSteamId("");
    setEditingCreds(true);
  }

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

  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [myPollsOpen, setMyPollsOpen] = useState(false);
  // Steam store region. The ref mirrors the state so loaders that run right after a change (in the
  // same handler, before the next render) and async continuations still read the current value.
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const countryRef = useRef<string>(DEFAULT_COUNTRY);
  const [countryOpen, setCountryOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  function changeCountry(code: string) {
    if (!isSupportedCountry(code) || code === countryRef.current) return;
    countryRef.current = code;
    setCountry(code);
    try {
      localStorage.setItem(COUNTRY_STORAGE_KEY, code);
      // The cached wishlist holds old-region price strings - drop it so a reload can't resurrect
      // them (the hydration check would reject it by its country stamp anyway; this just avoids
      // keeping dead data around).
      localStorage.removeItem(WISHLIST_CACHE_KEY);
    } catch {}
    // The ITAD low is a number in the OLD region's currency. /api/games never returns it, so a
    // per-game merge would carry it over onto the new region's prices and compare e.g. a won low
    // against a dollar price - strip it and let enrichLowestPrice re-ask under the new region.
    const stripped: Record<number, Game> = {};
    for (const [id, g] of Object.entries(wlGames)) {
      stripped[Number(id)] = { ...g, lowestPrice: undefined, lowestPriceCheckedForEnd: undefined };
    }
    setWlGames(stripped);
    setCountryOpen(false);
    if (wlItems.length > 0) loadWishlistWith(stripped);
  }
  const moreActionsWrapRef = useRef<HTMLDivElement>(null);
  // Plain controlled dropdown instead of the native popover API used elsewhere (statusPopover/
  // starPopover) - the native one renders in the top layer with no anchoring, so it centers
  // itself on screen instead of appearing right under its trigger button, which read as an
  // unrelated modal rather than a "more actions" menu for this specific button.
  useEffect(() => {
    if (!moreActionsOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (!moreActionsWrapRef.current?.contains(e.target as Node)) setMoreActionsOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreActionsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreActionsOpen]);
  // A library refresh only ever touches libItems/libGames (the Steam-fetched half), so merging
  // manual entries in here - rather than mixing them into libItems itself - means they survive
  // every "라이브러리 가져오기" click instead of being wiped by it.
  // Manual entries (library:manualGames etc.) aren't scoped to any particular steamId - they're
  // one global browser-wide list, unlike everything else here which is keyed by whichever account
  // is actually active. Gating on the Steam-sourced library actually having data (or having been
  // fetched at least once, even to zero) - rather than just steamId being non-empty - matters now
  // that identity is shared with the wishlist tab: typing/loading a wishlist id alone would
  // otherwise make manual entries appear on the library tab before it's ever been loaded, looking
  // like "게임 3개" when it's actually "no library yet, plus 3 manually-added games".
  const hasLibIdentity = libItems.length > 0 || libFetchedOnce;
  const combinedLibItems: Item[] = useMemo(
    () => [
      ...libItems,
      ...(hasLibIdentity
        ? Object.keys(manualPlatform).map((id) => ({
            appid: Number(id),
            playtimeMinutes: manualPlaytime[Number(id)],
          }))
        : []),
    ],
    [libItems, manualPlatform, manualPlaytime, hasLibIdentity],
  );
  const combinedLibGames = useMemo(
    () => ({ ...libGames, ...(hasLibIdentity ? manualGames : {}) }),
    [libGames, manualGames, hasLibIdentity],
  );
  const [manualFormOpen, setManualFormOpen] = useState(false);

  const items = view === "wishlist" ? wlItems : combinedLibItems;
  const games = view === "wishlist" ? wlGames : combinedLibGames;
  const {
    pollSelected,
    pollShowSelectedOnly,
    setPollShowSelectedOnly,
    pollCreating,
    pollError,
    pollLink,
    pollActiveForView,
    togglePollMode,
    closePollMode,
    togglePollSelect,
    createPoll,
  } = usePoll(view, games, steamId);
  const loading = view === "wishlist" ? wlLoading : libLoading;
  const progress = view === "wishlist" ? wlProgress : libProgress;
  const error = view === "wishlist" ? wlError : libError;
  const fetchedOnce = view === "wishlist" ? wlFetchedOnce : libFetchedOnce;
  const dataLoadedForView = view === "wishlist" ? wlItems.length > 0 : libItems.length > 0;
  const formVisible = editingCreds || !dataLoadedForView;

  function switchView(next: View) {
    setView(next);
    setSortKey(null);
  }
  const { markRefreshed, statusFor } = useRefreshStamp();
  const filters = useFilterState();
  const {
    sortKey,
    setSortKey,
    nameQuery,
    minDiscount,
    excludeEarlyAccess,
    excludeComingSoon,
    excludeNotLowest,
    koreanFilter,
    excludeAdult,
    excludeDemo,
    excludeFree,
    isMobile,
    genreFilter,
    statusFilter,
    ratingFilter,
    starFilter,
    platformFilter,
  } = filters;
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
  const ratingCounts = useMemo(() => {
    const counts: Record<string, number> = { like: 0, dislike: 0, none: 0 };
    for (const item of combinedLibItems) {
      const r = ratingMap[item.appid];
      counts[r ?? "none"]++;
    }
    return counts;
  }, [combinedLibItems, ratingMap]);
  const starCounts = useMemo(() => {
    const counts: Record<string, number> = { none: 0 };
    for (const v of STAR_VALUES) counts[v] = 0;
    for (const item of combinedLibItems) {
      const s = starMap[item.appid];
      counts[s ?? "none"]++;
    }
    return counts;
  }, [combinedLibItems, starMap]);
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
  // Steam's own store filter groups discounts into these same tiers (any/50%+/75%+) - each count
  // is "how many wishlist items clear this threshold", not an exclusive bucket, since minDiscount
  // is a minimum, not a range.
  const discountTierCounts = useMemo(() => {
    const counts = { any: 0, p50: 0, p75: 0 };
    for (const item of wlItems) {
      const pct = wlGames[item.appid]?.discountPercent ?? 0;
      if (pct > 0) counts.any++;
      if (pct >= 50) counts.p50++;
      if (pct >= 75) counts.p75++;
    }
    return counts;
  }, [wlItems, wlGames]);
  const [checkingAchievements, setCheckingAchievements] = useState<Set<number>>(() => new Set());
  // Lets a single row jump the queue instead of waiting for its turn in the slow background pass.
  async function checkOneAchievement(appid: number) {
    if (checkingAchievements.has(appid) || !steamId.trim()) return;
    setCheckingAchievements((prev) => new Set(prev).add(appid));
    try {
      const r = await fetch(
        `/api/achievements?steamid=${encodeURIComponent(steamId.trim())}&appids=${appid}`,
      );
      const d = await r.json();
      if (r.ok && d.achievements) {
        const updates: Record<number, AchievementInfo | null> = {};
        for (const [id, info] of Object.entries(d.achievements)) {
          updates[Number(id)] = info as AchievementInfo | null;
        }
        updateAchievements(updates);
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
  const genreXp = useMemo(
    () => computeGenreXp(combinedLibItems, combinedLibGames, statusMap),
    [combinedLibItems, combinedLibGames, statusMap],
  );
  const genreBreakdown = useMemo(
    () => computeGenreBreakdown(combinedLibItems, combinedLibGames, statusMap),
    [combinedLibItems, combinedLibGames, statusMap],
  );
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
  // them on the wishlist tab too (both tabs share one identity now, so it's always the same
  // account's library).
  const showGenreLevels =
    GENRE_LEVELING_ENABLED &&
    genreLevels.length > 0 &&
    genreXp.gameCount >= GENRE_LEVELS_MIN_GAMES &&
    genreXp.totalHours >= GENRE_LEVELS_MIN_HOURS;
  // Fine-grained GENRE_ALLOWLIST, not the coarse GENRE_LEVEL_ALLOWLIST - subgenre distinctions
  // like JRPG vs CRPG vs 액션 RPG matter here, unlike for the level badge where they'd just dilute
  // one bucket. A genre only surfaces once it's crossed TASTE_MIN_GAMES games, so a couple of
  // flukes (one dropped game, one over-generous 5-star) can't swing a tiny-sample average.
  const genreTaste = useMemo(
    () =>
      computeGenreTaste(
        combinedLibItems,
        combinedLibGames,
        statusMap,
        ratingMap,
        starMap,
        achievementMap,
      ),
    [combinedLibItems, combinedLibGames, statusMap, ratingMap, starMap, achievementMap],
  );
  // Keyed by genreId for O(1) lookup from recommendScore, rather than re-scanning the array per
  // wishlist game on every sort comparison.
  const genreTasteMap = useMemo(() => {
    const map: Record<number, { affinity: number; games: number }> = {};
    for (const { genreId, affinity, games } of genreTaste) map[genreId] = { affinity, games };
    return map;
  }, [genreTaste]);
  // Wishlist-wide (not just what's currently filtered/visible), so a game shows the same label
  // regardless of which filters happen to be active - see computeRecommendFit.
  const recommendFit = useMemo(
    () => (GENRE_LEVELING_ENABLED ? computeRecommendFit(wlItems, wlGames, genreTasteMap) : {}),
    [wlItems, wlGames, genreTasteMap],
  );
  const [genreTab, setGenreTab] = useState<"level" | "taste">("level");
  const filteredItems = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return items.filter((item) => {
      const g = games[item.appid];
      if (q && !(g?.name ?? "").toLowerCase().includes(q)) return false;
      if (pollActiveForView && pollShowSelectedOnly && !pollSelected.has(item.appid)) return false;
      if (view === "wishlist" && minDiscount > 0 && !(g && g.discountPercent >= minDiscount))
        return false;
      if (view === "wishlist" && excludeEarlyAccess && g?.earlyAccess) return false;
      if (view === "wishlist" && excludeComingSoon && g?.comingSoon) return false;
      if (view === "wishlist" && excludeNotLowest && lowestPriceStatus(g) === "not-at-low")
        return false;
      if (view === "wishlist" && koreanFilter) {
        const k = g?.koreanSupported ? "supported" : "unsupported";
        if (koreanFilter !== k) return false;
      }
      if (view === "library" && excludeAdult && g?.adultContent) return false;
      if (view === "library" && excludeDemo && g?.isDemo) return false;
      if (view === "library" && excludeFree && g?.isFree) return false;
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
    pollActiveForView,
    pollShowSelectedOnly,
    pollSelected,
    minDiscount,
    excludeEarlyAccess,
    excludeComingSoon,
    excludeNotLowest,
    koreanFilter,
    excludeAdult,
    excludeDemo,
    excludeFree,
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
      ? minDiscount > 0 ||
        excludeEarlyAccess ||
        excludeComingSoon ||
        excludeNotLowest ||
        koreanFilter !== null
      : excludeAdult ||
        excludeDemo ||
        excludeFree ||
        statusFilter.length > 0 ||
        ratingFilter.length > 0 ||
        starFilter.length > 0 ||
        platformFilter.length > 0);
  const [listWrapRef, listSize] = useElementSize();
  const [layoutMode, setLayoutMode] = useState<"list" | "card">("list");
  // Set within the mount-hydration effect below when a remembered account exists but the current
  // view's item cache got invalidated by a CACHE_VERSION bump (see that constant's comment) -
  // without this, a returning user with a remembered id would land on an unexpectedly empty
  // list and have to notice and click 가져오기/새로고침 themselves. loadWishlist/loadLibrary read
  // the `steamId` state directly, which is still "" inside that same effect (its setSteamId call
  // hasn't committed yet) - so the actual fetch happens in a separate effect below instead, once
  // steamId has actually flushed to a real value.
  const [needsAutoLoad, setNeedsAutoLoad] = useState(false);
  // One-time hydration from localStorage on mount; SSR has no localStorage, so this must run in an
  // effect. Uses useLayoutEffect (not useEffect) so it commits before the browser paints - closes
  // the tiny window where a value typed immediately on load could get stomped by this hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    try {
      const savedId = localStorage.getItem(STEAM_ID_STORAGE_KEY);
      if (savedId) setSteamId(savedId);
      const savedCountryRaw = localStorage.getItem(COUNTRY_STORAGE_KEY);
      const savedCountry = isSupportedCountry(savedCountryRaw) ? savedCountryRaw : DEFAULT_COUNTRY;
      countryRef.current = savedCountry;
      if (savedCountry !== DEFAULT_COUNTRY) setCountry(savedCountry);
      const wl = JSON.parse(localStorage.getItem(WISHLIST_CACHE_KEY) ?? "null");
      if (!savedId && wl?.steamId) setSteamId(wl.steamId);
      // A cache written before regions existed has no `country` and was necessarily KR. Prices in
      // it are only usable for the same region - the library cache isn't checked, since nothing
      // in the library view displays a price.
      const wlCacheValid =
        wl?.version === CACHE_VERSION &&
        Array.isArray(wl?.items) &&
        (wl?.country ?? DEFAULT_COUNTRY) === savedCountry;
      if (wlCacheValid) {
        setWlItems(wl.items);
        setWlProgress({ done: wl.items.length, total: wl.items.length });
        if (wl.games) setWlGames(wl.games);
      }
      const lib = JSON.parse(localStorage.getItem(LIBRARY_CACHE_KEY) ?? "null");
      if (!savedId && !wl?.steamId && lib?.steamId) setSteamId(lib.steamId);
      const libCacheValid = lib?.version === CACHE_VERSION && Array.isArray(lib?.items);
      if (libCacheValid) {
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
      // Item/game caches are already restored above; only the profile still needs a fresh fetch to
      // show the profile card again. Falls back to the server's own STEAM_API_KEY env var, no
      // client key involved.
      const restoredId = savedId || wl?.steamId || lib?.steamId;
      // Has a remembered account, but the item cache for whichever view is currently showing
      // (always "wishlist" at a true first mount) wasn't restored above - without an explicit
      // reload, this account would just look empty instead of actually loading their data.
      if (restoredId && !(view === "wishlist" ? wlCacheValid : libCacheValid)) {
        setNeedsAutoLoad(true);
      }
      // Marks these seven maps as already belonging to this id, so if the very first explicit
      // load this session is a *different* id (switched accounts without ever fetching the
      // restored one first), resetPerAccountStateIfIdChanged still recognizes it as a change
      // instead of treating the cached account's leftover data as unowned.
      if (restoredId) activeSyncIdRef.current = restoredId;
      if (restoredId) {
        fetch(`/api/profile?steamid=${encodeURIComponent(restoredId)}`)
          .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (ok && d.profile) setProfile(d.profile);
          })
          .catch(() => {});
        // Pulls in whatever another device already synced, on top of the localStorage restore
        // above - lets status/rating/achievements show up here without re-fetching the library.
        syncFromServer(restoredId);
      }
    } catch {}
    // Intentionally mount-only (see comment above the effect) - syncFromServer itself is
    // recreated every render, but the maps it merges into come from refs (see their comment)
    // rather than this closure, so it's safe for only the version captured here, at mount, to
    // ever run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  // Fires the actual reload the mount effect above flagged as needed (steamId is still "" inside
  // that effect itself, since its own setSteamId call hasn't committed yet - this runs on the
  // render after, once steamId has a real value to load with). One-shot: clears the flag
  // immediately so this never fires again outside of that specific post-cache-invalidation case.
  useEffect(() => {
    if (!needsAutoLoad || !steamId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeedsAutoLoad(false);
    if (view === "wishlist") loadWishlist();
    else loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAutoLoad, steamId]);
  function persistTo(
    cacheKey: string,
    steamIdValue: string,
    itemsValue: Item[],
    gamesValue: Record<number, Game>,
  ) {
    // Unchecking "이 정보 저장" removes STEAM_ID_STORAGE_KEY (see loadWishlist/loadLibrary), but
    // this cache blob was a second, unguarded way for both the id and the actual list contents to
    // survive a reload regardless - the mount hydration effect reads it unconditionally, silently
    // undoing the opt-out (you'd see your library again next time with a blank id field, which
    // defeats the point). Skip writing it at all when not remembering, rather than trying to
    // persist a partially-scrubbed version - "don't remember me" should leave nothing behind, not
    // just hide the id digits specifically.
    if (!rememberMe) return;
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          version: CACHE_VERSION,
          country: countryRef.current,
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
    persistTo(WISHLIST_CACHE_KEY, steamId, itemsValue, gamesValue);
  }
  function persistLibraryThrottled(itemsValue: Item[], gamesValue: Record<number, Game>) {
    // Event-handler-only helper, never called during render - the compiler's reachability
    // analysis has previously mis-flagged this once enough other code is added to this component
    // (not reproducible in isolation, and reactCompiler isn't even enabled in next.config, so no
    // build/runtime effect either way) - re-add an eslint-disable-next-line react-hooks/purity
    // here if it resurfaces.
    const now = Date.now();
    if (now - lastLibPersistAt.current < 1500) return;
    lastLibPersistAt.current = now;
    persistTo(LIBRARY_CACHE_KEY, steamId, itemsValue, gamesValue);
  }
  // Zero-arg on purpose: this is passed straight to onClick handlers, which would otherwise hand
  // the click event in as `gamesOverride`. Region changes call loadWishlistWith directly instead.
  function loadWishlist() {
    return loadWishlistWith();
  }
  async function loadWishlistWith(gamesOverride?: Record<number, Game>) {
    const id = steamId.trim();
    if (!/^\d{17}$/.test(id)) {
      setWlError("17자리 Steam ID64를 입력하세요.");
      return;
    }
    resetPerAccountStateIfIdChanged(id, clearProfileForAccountChange);
    try {
      if (rememberMe) localStorage.setItem(STEAM_ID_STORAGE_KEY, id);
      else {
        localStorage.removeItem(STEAM_ID_STORAGE_KEY);
        // Also drop any cache blob left over from a previous session where remember-me was on -
        // persistTo skips writing a new one while off, but doesn't retroactively clear an old one.
        localStorage.removeItem(WISHLIST_CACHE_KEY);
      }
    } catch {}
    // Fire-and-forget, same as the library tab's profile fetch - no user-entered key needed here,
    // the server falls back to its own STEAM_API_KEY env var for this lookup.
    setProfileError("");
    setProfileLoading(true);
    fetch(`/api/profile?steamid=${encodeURIComponent(id)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d.profile) setProfile(d.profile);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
    setWlLoading(true);
    setWlError("");
    try {
      const r = await fetch(`/api/wishlist?steamid=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const list: Item[] = (d.items ?? []).map((x: { appid: number }) => ({ appid: x.appid }));
      setWlItems(list);
      setWlFetchedOnce(true);
      setEditingCreds(false);
      const listAppids = new Set(list.map((x) => x.appid));
      const existing: Record<number, Game> = {};
      for (const [id, g] of Object.entries(gamesOverride ?? wlGames)) {
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
        countryRef.current,
      );
      persistTo(WISHLIST_CACHE_KEY, id, list, loaded);
      markRefreshed("wishlist");
      enrichMetacritic(appids, loaded, (cur) => {
        setWlGames((prev) => {
          const merged = mergeGamesInto(prev, cur);
          persistWishlistThrottled(list, merged);
          return merged;
        });
      }).catch(() => {});
      // Scoped to currently-discounted games only - a full-price game's historical low isn't
      // "is this worth buying now" information the way it is for one that's actually on sale, and
      // checking every wishlist item (not just the ones a discount makes worth checking) was the
      // main thing driving unnecessary ITAD lookups through the shared cache.
      const discountedAppids = appids.filter((appid) => (loaded[appid]?.discountPercent ?? 0) > 0);
      enrichLowestPrice(
        discountedAppids,
        loaded,
        (cur) => {
          setWlGames((prev) => {
            const merged = mergeGamesInto(prev, cur);
            persistWishlistThrottled(list, merged);
            return merged;
          });
        },
        countryRef.current,
      ).catch(() => {});
    } catch (e) {
      setWlError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setWlLoading(false);
    }
  }
  async function loadLibrary() {
    const id = steamId.trim();
    if (!/^\d{17}$/.test(id)) {
      setLibError("17자리 Steam ID64를 입력하세요.");
      return;
    }
    resetPerAccountStateIfIdChanged(id, clearProfileForAccountChange);
    try {
      if (rememberMe) {
        localStorage.setItem(STEAM_ID_STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STEAM_ID_STORAGE_KEY);
        // Also drop any cache blob left over from a previous session where remember-me was on -
        // persistTo skips writing a new one while off, but doesn't retroactively clear an old one.
        localStorage.removeItem(LIBRARY_CACHE_KEY);
      }
    } catch {}
    // Fire-and-forget alongside the library fetch below - the profile card is a nice-to-have,
    // not something the library load should wait on or fail because of.
    setProfileError("");
    setProfileLoading(true);
    fetch(`/api/profile?steamid=${encodeURIComponent(id)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d.profile) {
          setProfile(d.profile);
        } else {
          setProfile(null);
          setProfileError(d.error ?? "프로필을 가져오지 못했습니다. Steam ID64를 확인하세요.");
        }
      })
      .catch(() => {
        setProfile(null);
        setProfileError("프로필을 가져오지 못했습니다. 네트워크 상태를 확인하세요.");
      })
      .finally(() => setProfileLoading(false));
    syncFromServer(id);
    setLibLoading(true);
    setLibError("");
    try {
      const r = await fetch(`/api/library?steamid=${encodeURIComponent(id)}`);
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
      setEditingCreds(false);
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
        countryRef.current,
      );
      persistTo(LIBRARY_CACHE_KEY, id, list, loaded);
      markRefreshed("library");
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
        excludeFree,
        statusMap,
        ratingMap,
        starMap,
        manualPlatform,
      });
      // Force-refresh only the most-recently-played games - achievement % can't have moved for
      // one that hasn't been played since the last check, so re-checking the whole library on
      // every "새로고침" would burn ~1 Steam API call per game (no batch endpoint for this) for
      // almost entirely unchanged data. Everything else still gets filled in if it's never been
      // checked at all.
      const recentIds = new Set(
        [...list]
          .sort((a, b) => (b.lastPlayedTimestamp ?? 0) - (a.lastPlayedTimestamp ?? 0))
          .slice(0, ACHIEVEMENT_REFRESH_RECENT_COUNT)
          .map((x) => x.appid),
      );
      enrichAchievements(achievementOrder, id, achievementMap, updateAchievements, recentIds).catch(
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
      <Sidebar
        filters={filters}
        discountTierCounts={discountTierCounts}
        error={error}
        formVisible={formVisible}
        genreCounts={genreCounts}
        genreLevels={genreLevels}
        genreBreakdown={genreBreakdown}
        genreTab={genreTab}
        genreTaste={genreTaste}
        koreanCounts={koreanCounts}
        loadActive={loadActive}
        loading={loading}
        openCredsForm={openCredsForm}
        platformCounts={platformCounts}
        profile={profile}
        profileError={profileError}
        profileLoading={profileLoading}
        ratingCounts={ratingCounts}
        rememberMe={rememberMe}
        setGenreTab={setGenreTab}
        setRememberMe={setRememberMe}
        setSteamId={setSteamId}
        showGenreLevels={showGenreLevels}
        starCounts={starCounts}
        statusCounts={statusCounts}
        steamId={steamId}
        switchView={switchView}
        view={view}
      />
      <main className="mainArea">
        <Toolbar
          filters={filters}
          country={country}
          filteredItems={filteredItems}
          hasActiveFilter={hasActiveFilter}
          items={items}
          layoutMode={layoutMode}
          loadActive={loadActive}
          refreshDue={dataLoadedForView && statusFor(view).stale}
          refreshLabel={statusFor(view).label}
          loading={loading}
          moreActionsOpen={moreActionsOpen}
          moreActionsWrapRef={moreActionsWrapRef}
          pollActiveForView={pollActiveForView}
          setCountryOpen={setCountryOpen}
          setSyncOpen={setSyncOpen}
          syncLocked={syncLink === "locked"}
          setLayoutMode={setLayoutMode}
          setManualFormOpen={setManualFormOpen}
          setMoreActionsOpen={setMoreActionsOpen}
          setMyPollsOpen={setMyPollsOpen}
          togglePollMode={togglePollMode}
          view={view}
        />
        {view === "library" && manualFormOpen && (
          <ManualAddPanel
            country={countryRef.current}
            onAdd={addManualGame}
            onClose={() => setManualFormOpen(false)}
          />
        )}
        {countryOpen && (
          <CountryPanel
            current={country}
            onSelect={changeCountry}
            onClose={() => setCountryOpen(false)}
          />
        )}
        {syncOpen && (
          <SyncPanel
            steamId={steamId.trim()}
            link={syncLink}
            onLink={linkSyncCode}
            onClose={() => setSyncOpen(false)}
          />
        )}
        {myPollsOpen && (
          <MyPollsPanel steamId={steamId.trim()} onClose={() => setMyPollsOpen(false)} />
        )}
        {pollActiveForView && (
          <PollBar
            closePollMode={closePollMode}
            createPoll={createPoll}
            pollCreating={pollCreating}
            pollError={pollError}
            pollLink={pollLink}
            pollSelected={pollSelected}
            pollShowSelectedOnly={pollShowSelectedOnly}
            setPollShowSelectedOnly={setPollShowSelectedOnly}
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
                  : "Steam ID64를 입력하면 보유 게임 목록을 가져옵니다."}
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
                recommendFit,
                sortKey,
                steamId,
                pollMode: pollActiveForView,
                pollSelected,
                onTogglePollSelect: togglePollSelect,
              }}
              style={{ height: listSize.height, width: "100%" }}
            />
          ) : listSize.height > 0 && listSize.width > 0 ? (
            (() => {
              // Below CARD_NARROW_BREAKPOINT the min-width rule gives 1 column (e.g. 340px / 190),
              // which stretches each card to full width and crops the cover art badly - phones get
              // a fixed 2-column grid instead.
              const columnCount =
                listSize.width < CARD_NARROW_BREAKPOINT
                  ? 2
                  : Math.max(1, Math.floor(listSize.width / CARD_MIN_WIDTH));
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
                    pollMode: pollActiveForView,
                    pollSelected,
                    onTogglePollSelect: togglePollSelect,
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
