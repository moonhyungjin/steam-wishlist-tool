"use client";
import { useEffect, useRef, useState } from "react";
import type {
  Game,
  PlayStatus,
  Rating,
  StarRating,
  AchievementInfo,
  ManualPlatform,
} from "./types";
import {
  STATUS_STORAGE_KEY,
  RATING_STORAGE_KEY,
  STAR_STORAGE_KEY,
  ACHIEVEMENT_STORAGE_KEY,
  MANUAL_PLATFORM_STORAGE_KEY,
  MANUAL_GAMES_STORAGE_KEY,
  MANUAL_PLAYTIME_STORAGE_KEY,
  MANUAL_REMOVED_STORAGE_KEY,
} from "./constants";

// The per-account data that can't be re-fetched from Steam (play status, ratings, stars,
// achievements, manually-added games), plus everything that keeps it in sync: the localStorage
// writes, the refs that always hold the latest values, the per-account reset, and the cross-device
// push/pull against /api/sync. steamId is whichever account is currently entered.
export function useSyncedData(steamId: string) {
  const [manualPlatform, setManualPlatform] = useState<Record<number, ManualPlatform>>({});
  const [manualGames, setManualGames] = useState<Record<number, Game>>({});
  const [manualPlaytime, setManualPlaytime] = useState<Record<number, number>>({});
  const [manualRemovedIds, setManualRemovedIds] = useState<number[]>([]);
  function persistManualRemoved(ids: number[]) {
    try {
      localStorage.setItem(MANUAL_REMOVED_STORAGE_KEY, JSON.stringify(ids));
    } catch {}
  }
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
  const [statusMap, setStatusMap] = useState<Record<number, PlayStatus>>({});
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
  const [ratingMap, setRatingMap] = useState<Record<number, Rating>>({});
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
  const [achievementMap, setAchievementMap] = useState<Record<number, AchievementInfo | null>>({});
  // syncFromServer (below) is called once from the mount-only hydration effect, whose closure is
  // frozen at whatever these seven maps were at the moment that effect's callback was created -
  // the empty initial state, before localStorage hydration even runs. Reading the closed-over
  // state directly there would make the "prefer local over stale/empty server data" check always
  // see length===0 and let the server unconditionally win - e.g. resurrecting a manual game you
  // just deleted, if the delete's fire-and-forget pushSync hadn't reached the server yet by the
  // time you reloaded. These refs always hold the latest value regardless of when the closure
  // reading them was created, so syncFromServer reads from them instead of the state directly.
  const statusMapRef = useRef(statusMap);
  const ratingMapRef = useRef(ratingMap);
  const starMapRef = useRef(starMap);
  const achievementMapRef = useRef(achievementMap);
  const manualPlatformRef = useRef(manualPlatform);
  const manualGamesRef = useRef(manualGames);
  const manualPlaytimeRef = useRef(manualPlaytime);
  const manualRemovedIdsRef = useRef(manualRemovedIds);
  useEffect(() => {
    statusMapRef.current = statusMap;
    ratingMapRef.current = ratingMap;
    starMapRef.current = starMap;
    achievementMapRef.current = achievementMap;
    manualPlatformRef.current = manualPlatform;
    manualGamesRef.current = manualGames;
    manualPlaytimeRef.current = manualPlaytime;
    manualRemovedIdsRef.current = manualRemovedIds;
  });
  // Tracks which steamId these seven maps currently belong to. They used to implicitly belong to
  // "whichever account is active" back when there was only ever one per session - now that
  // 계정 변경 lets the same browser tab switch to a different steamId, without this the previous
  // account's status/rating/stars/achievements/manual games would still be sitting in state and
  // localStorage when the new account loads. Worse than just a display glitch: if the new account
  // has never synced anything of its own, syncFromServer's "prefer local over empty server data"
  // safeguard (see its comment) would keep the old account's data showing, and any edit afterward
  // would push it straight into the new account's own server record.
  const activeSyncIdRef = useRef<string | null>(null);
  function resetPerAccountStateIfIdChanged(id: string, onAccountChanged?: () => void) {
    if (activeSyncIdRef.current !== null && activeSyncIdRef.current !== id) {
      // Lets the caller clear anything else tied to the previous account (the profile card, so its
      // avatar/name doesn't linger while the new account's own profile is still being fetched).
      onAccountChanged?.();
      setStatusMap({});
      setRatingMap({});
      setStarMap({});
      setAchievementMap({});
      setManualPlatform({});
      setManualGames({});
      setManualPlaytime({});
      setManualRemovedIds([]);
      // Refs are updated inline (not just via the effect above) because syncFromServer runs
      // synchronously right after this, in the same call - it needs to see the reset immediately,
      // not after the next render/commit.
      statusMapRef.current = {};
      ratingMapRef.current = {};
      starMapRef.current = {};
      achievementMapRef.current = {};
      manualPlatformRef.current = {};
      manualGamesRef.current = {};
      manualPlaytimeRef.current = {};
      manualRemovedIdsRef.current = [];
      try {
        localStorage.removeItem(STATUS_STORAGE_KEY);
        localStorage.removeItem(RATING_STORAGE_KEY);
        localStorage.removeItem(STAR_STORAGE_KEY);
        localStorage.removeItem(ACHIEVEMENT_STORAGE_KEY);
        localStorage.removeItem(MANUAL_PLATFORM_STORAGE_KEY);
        localStorage.removeItem(MANUAL_GAMES_STORAGE_KEY);
        localStorage.removeItem(MANUAL_PLAYTIME_STORAGE_KEY);
        localStorage.removeItem(MANUAL_REMOVED_STORAGE_KEY);
      } catch {}
    }
    activeSyncIdRef.current = id;
  }
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
    manualRemovedIds?: number[];
  }) {
    const id = steamId.trim();
    if (!/^\d{17}$/.test(id)) return;
    // Reads the *Ref mirrors (not the state variables directly) for the same reason
    // syncFromServer does - see its comment above the ref declarations. /api/sync's POST fully
    // overwrites the stored record rather than merging field-by-field, so any un-overridden field
    // here that fell back to a stale render's closured state (instead of the always-current ref)
    // would silently wipe out newer data already saved server-side - most dangerously
    // achievementMap, which gets pushed repeatedly in small chunks during every library load.
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steamId: id,
        statusMap: overrides.statusMap ?? statusMapRef.current,
        ratingMap: overrides.ratingMap ?? ratingMapRef.current,
        starMap: overrides.starMap ?? starMapRef.current,
        achievementMap: overrides.achievementMap ?? achievementMapRef.current,
        manualPlatform: overrides.manualPlatform ?? manualPlatformRef.current,
        manualGames: overrides.manualGames ?? manualGamesRef.current,
        manualPlaytime: overrides.manualPlaytime ?? manualPlaytimeRef.current,
        manualRemovedIds: overrides.manualRemovedIds ?? manualRemovedIdsRef.current,
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
          (Object.keys(d.statusMap).length > 0 || Object.keys(statusMapRef.current).length === 0)
        ) {
          setStatusMap(d.statusMap);
          try {
            localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(d.statusMap));
          } catch {}
        }
        if (
          d.ratingMap &&
          (Object.keys(d.ratingMap).length > 0 || Object.keys(ratingMapRef.current).length === 0)
        ) {
          setRatingMap(d.ratingMap);
          try {
            localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(d.ratingMap));
          } catch {}
        }
        if (
          d.starMap &&
          (Object.keys(d.starMap).length > 0 || Object.keys(starMapRef.current).length === 0)
        ) {
          setStarMap(d.starMap);
          try {
            localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify(d.starMap));
          } catch {}
        }
        if (
          d.achievementMap &&
          (Object.keys(d.achievementMap).length > 0 ||
            Object.keys(achievementMapRef.current).length === 0)
        ) {
          setAchievementMap(d.achievementMap);
          try {
            localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(d.achievementMap));
          } catch {}
        }
        // Union server's tombstone into local rather than picking one side - a deletion made on
        // another device (only visible via d.manualRemovedIds) must still apply here even though
        // it never happened locally, and a deletion made only here must survive a pull that
        // hasn't seen it yet either. Persisted and pushed back so this device's now-more-complete
        // list can propagate onward the next time some other device loads.
        const unionedRemovedIds = [
          ...new Set([...manualRemovedIdsRef.current, ...(d.manualRemovedIds ?? [])]),
        ];
        if (unionedRemovedIds.length !== manualRemovedIdsRef.current.length) {
          setManualRemovedIds(unionedRemovedIds);
          persistManualRemoved(unionedRemovedIds);
          pushSync({ manualRemovedIds: unionedRemovedIds });
        }
        // Filter out anything tombstoned (by this device or any other) before it's even
        // considered - otherwise a still-stale (but non-empty) server snapshot would resurrect a
        // deletion, since the length-based "prefer local" check below only ever catches a
        // fully-empty server response.
        const removedIds = new Set(unionedRemovedIds);
        const filteredManualPlatform = d.manualPlatform
          ? Object.fromEntries(
              Object.entries(d.manualPlatform).filter(([id]) => !removedIds.has(Number(id))),
            )
          : d.manualPlatform;
        const filteredManualGames = d.manualGames
          ? Object.fromEntries(
              Object.entries(d.manualGames).filter(([id]) => !removedIds.has(Number(id))),
            )
          : d.manualGames;
        if (
          filteredManualPlatform &&
          (Object.keys(filteredManualPlatform).length > 0 ||
            Object.keys(manualPlatformRef.current).length === 0)
        ) {
          setManualPlatform(filteredManualPlatform);
          try {
            localStorage.setItem(
              MANUAL_PLATFORM_STORAGE_KEY,
              JSON.stringify(filteredManualPlatform),
            );
          } catch {}
        }
        if (
          filteredManualGames &&
          (Object.keys(filteredManualGames).length > 0 ||
            Object.keys(manualGamesRef.current).length === 0)
        ) {
          setManualGames(filteredManualGames);
          try {
            localStorage.setItem(MANUAL_GAMES_STORAGE_KEY, JSON.stringify(filteredManualGames));
          } catch {}
        }
        const filteredManualPlaytime = d.manualPlaytime
          ? Object.fromEntries(
              Object.entries(d.manualPlaytime).filter(([id]) => !removedIds.has(Number(id))),
            )
          : d.manualPlaytime;
        if (
          filteredManualPlaytime &&
          (Object.keys(filteredManualPlaytime).length > 0 ||
            Object.keys(manualPlaytimeRef.current).length === 0)
        ) {
          setManualPlaytime(filteredManualPlaytime);
          try {
            localStorage.setItem(
              MANUAL_PLAYTIME_STORAGE_KEY,
              JSON.stringify(filteredManualPlaytime),
            );
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
  return {
    manualPlatform,
    setManualPlatform,
    manualGames,
    setManualGames,
    manualPlaytime,
    setManualPlaytime,
    manualRemovedIds,
    setManualRemovedIds,
    statusMap,
    setStatusMap,
    ratingMap,
    setRatingMap,
    starMap,
    setStarMap,
    achievementMap,
    setAchievementMap,
    persistManualRemoved,
    persistManual,
    setManualPlaytimeHours,
    setGameStatus,
    setGameRating,
    setGameStar,
    resetPerAccountStateIfIdChanged,
    pushSync,
    syncFromServer,
    updateAchievements,
    statusMapRef,
    ratingMapRef,
    starMapRef,
    achievementMapRef,
    manualPlatformRef,
    manualGamesRef,
    manualPlaytimeRef,
    manualRemovedIdsRef,
    activeSyncIdRef,
  };
}
