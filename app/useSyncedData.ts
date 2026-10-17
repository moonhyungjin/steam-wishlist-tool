"use client";
import { useEffect, useRef, useState } from "react";
import { getSyncToken, setSyncToken } from "./syncToken";
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
import {
  SYNC_MAPS,
  SyncQueue,
  allEntriesAsOps,
  applyOps,
  emptyMaps,
  missingEntriesAsOps,
  type SendResult,
  type SyncMapName,
  type SyncMaps,
  type SyncOp,
} from "./syncOps";

const STORAGE_KEYS: Record<SyncMapName, string> = {
  statusMap: STATUS_STORAGE_KEY,
  ratingMap: RATING_STORAGE_KEY,
  starMap: STAR_STORAGE_KEY,
  achievementMap: ACHIEVEMENT_STORAGE_KEY,
  manualPlatform: MANUAL_PLATFORM_STORAGE_KEY,
  manualGames: MANUAL_GAMES_STORAGE_KEY,
  manualPlaytime: MANUAL_PLAYTIME_STORAGE_KEY,
};
// This device's not-yet-confirmed ops (see SyncQueue), so a reload doesn't lose them.
const queueKey = (steamId: string) => `syncQueue:${steamId}`;
// Set once this device has done its one-time catch-up upload for an account (see syncFromServer).
const mergedKey = (steamId: string) => `syncMerged:${steamId}`;
// A tab left open gets refreshed from the server when it's looked at again, but not more often.
const REFOCUS_PULL_MS = 30_000;

// The per-account data that can't be re-fetched from Steam (play status, ratings, stars,
// achievements, manually-added games), plus everything that keeps it in sync: the localStorage
// writes, the refs that always hold the latest values, the per-account reset, and the cross-device
// push/pull against /api/sync. steamId is whichever account is currently entered.
export type SyncLinkState = "unknown" | "unclaimed" | "linked" | "locked";
export function useSyncedData(steamId: string) {
  // Whether this browser may write the account's synced record - see app/api/sync/route.ts.
  const [syncLink, setSyncLink] = useState<SyncLinkState>("unknown");
  const [manualPlatform, setManualPlatform] = useState<Record<number, ManualPlatform>>({});
  const [manualGames, setManualGames] = useState<Record<number, Game>>({});
  const [manualPlaytime, setManualPlaytime] = useState<Record<number, number>>({});
  const [statusMap, setStatusMap] = useState<Record<number, PlayStatus>>({});
  const [ratingMap, setRatingMap] = useState<Record<number, Rating>>({});
  const [starMap, setStarMap] = useState<Record<number, StarRating>>({});
  const [achievementMap, setAchievementMap] = useState<Record<number, AchievementInfo | null>>({});
  // Every change and every pull builds on these, not on the state variables: syncFromServer runs
  // from the mount-only hydration effect and from fetch callbacks, whose closures hold whatever
  // state existed when they were created - often the empty initial one. The refs always hold the
  // latest value; commit() updates them inline so a second change in the same handler (e.g.
  // removing a manual game touches six maps) sees the first.
  const statusMapRef = useRef(statusMap);
  const ratingMapRef = useRef(ratingMap);
  const starMapRef = useRef(starMap);
  const achievementMapRef = useRef(achievementMap);
  const manualPlatformRef = useRef(manualPlatform);
  const manualGamesRef = useRef(manualGames);
  const manualPlaytimeRef = useRef(manualPlaytime);
  useEffect(() => {
    statusMapRef.current = statusMap;
    ratingMapRef.current = ratingMap;
    starMapRef.current = starMap;
    achievementMapRef.current = achievementMap;
    manualPlatformRef.current = manualPlatform;
    manualGamesRef.current = manualGames;
    manualPlaytimeRef.current = manualPlaytime;
  });
  const slots = {
    statusMap: [statusMapRef, setStatusMap],
    ratingMap: [ratingMapRef, setRatingMap],
    starMap: [starMapRef, setStarMap],
    achievementMap: [achievementMapRef, setAchievementMap],
    manualPlatform: [manualPlatformRef, setManualPlatform],
    manualGames: [manualGamesRef, setManualGames],
    manualPlaytime: [manualPlaytimeRef, setManualPlaytime],
  } as unknown as Record<
    SyncMapName,
    [{ current: Record<number, unknown> }, (v: Record<number, unknown>) => void]
  >;
  function currentMaps(): SyncMaps {
    return Object.fromEntries(SYNC_MAPS.map((m) => [m, slots[m][0].current])) as SyncMaps;
  }
  function commit(map: SyncMapName, next: Record<number, unknown>) {
    slots[map][0].current = next;
    slots[map][1](next);
    try {
      localStorage.setItem(STORAGE_KEYS[map], JSON.stringify(next));
    } catch {}
  }

  // Tracks which steamId these maps currently belong to. They used to implicitly belong to
  // "whichever account is active" back when there was only ever one per session - now that
  // 계정 변경 lets the same browser tab switch to a different steamId, without this the previous
  // account's status/rating/stars/achievements/manual games would still be sitting in state and
  // localStorage when the new account loads, and the first-sync upload (see syncFromServer) would
  // push them straight into the new account's own server record.
  const activeSyncIdRef = useRef<string | null>(null);
  const queueRef = useRef<{ id: string; queue: SyncQueue } | null>(null);
  const lastPullAtRef = useRef(0);

  async function sendOps(id: string, ops: SyncOp[]): Promise<SendResult> {
    const token = getSyncToken(id);
    if (!token) return "ok"; // no storage, so no token - nothing this device can ever send
    const r = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-token": token },
      body: JSON.stringify({ steamId: id, ops }),
    });
    if (r.status === 403) return "locked";
    if (r.ok) {
      setSyncLink((prev) => (prev === "locked" ? prev : "linked"));
      return "ok";
    }
    // Server/network trouble is worth retrying; a refused request (400/409) would be refused again,
    // and keeping it would block every op queued behind it.
    return r.status >= 500 || r.status === 429 ? "retry" : "ok";
  }
  function queueFor(id: string): SyncQueue {
    if (queueRef.current?.id === id) return queueRef.current.queue;
    let saved: SyncOp[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(queueKey(id)) ?? "null");
      if (Array.isArray(parsed)) saved = parsed;
    } catch {}
    const queue = new SyncQueue(
      (ops) => sendOps(id, ops),
      (ops) => {
        try {
          if (ops.length) localStorage.setItem(queueKey(id), JSON.stringify(ops));
          else localStorage.removeItem(queueKey(id));
        } catch {}
      },
      () => setSyncLink("locked"),
      saved,
    );
    queueRef.current = { id, queue };
    return queue;
  }
  // Applies ops locally (state + localStorage, right away) and queues them for the server.
  function change(ops: SyncOp[]) {
    const next = applyOps(currentMaps(), ops);
    for (const map of new Set(ops.map((o) => o.map))) commit(map, next[map]);
    const id = activeSyncIdRef.current ?? steamId.trim();
    if (/^\d{17}$/.test(id)) queueFor(id).enqueue(ops);
  }
  const setOrDel = (map: SyncMapName, appid: number, value: unknown): SyncOp =>
    value == null ? { map, appid, op: "del" } : { map, appid, op: "set", value };

  function setGameStatus(appid: number, status: PlayStatus | null) {
    change([setOrDel("statusMap", appid, status)]);
  }
  function setGameRating(appid: number, rating: Rating | null) {
    change([setOrDel("ratingMap", appid, rating)]);
  }
  function setGameStar(appid: number, star: StarRating | null) {
    change([setOrDel("starMap", appid, star)]);
  }
  function setManualPlaytimeHours(appid: number, hours: number | null) {
    const minutes = hours == null || !(hours > 0) ? null : Math.round(hours * 60);
    change([setOrDel("manualPlaytime", appid, minutes)]);
  }
  function addManualGame(appid: number, platform: ManualPlatform, game: Game) {
    change([
      { map: "manualPlatform", appid, op: "set", value: platform },
      { map: "manualGames", appid, op: "set", value: game },
    ]);
  }
  // Takes everything personal about the game with it, star included.
  function removeManualGame(appid: number) {
    change(
      (
        [
          "manualPlatform",
          "manualGames",
          "manualPlaytime",
          "statusMap",
          "ratingMap",
          "starMap",
        ] as const
      ).map((map) => ({ map, appid, op: "del" as const })),
    );
  }
  // Only the entries that were just checked - merged into whatever is current, so a slow
  // background pass never puts back a map from before a pull or another update.
  function updateAchievements(updates: Record<number, AchievementInfo | null>) {
    const ops: SyncOp[] = Object.entries(updates).map(([id, value]) => ({
      map: "achievementMap",
      appid: Number(id),
      op: "set",
      value,
    }));
    if (ops.length) change(ops);
  }

  function resetPerAccountStateIfIdChanged(id: string, onAccountChanged?: () => void) {
    if (activeSyncIdRef.current !== null && activeSyncIdRef.current !== id) {
      // Lets the caller clear anything else tied to the previous account (the profile card, so its
      // avatar/name doesn't linger while the new account's own profile is still being fetched).
      onAccountChanged?.();
      // commit() updates the refs inline because syncFromServer runs synchronously right after
      // this, in the same call - it needs to see the reset immediately, not after the next render.
      for (const map of SYNC_MAPS) commit(map, {});
      try {
        localStorage.removeItem(MANUAL_REMOVED_STORAGE_KEY);
      } catch {}
      // The previous account's unsent ops go with its data - this browser no longer holds that
      // account's maps to replay them against.
      queueRef.current?.queue.clear();
      queueRef.current = null;
    }
    activeSyncIdRef.current = id;
  }

  // Before per-entry sync, manual-game deletions were remembered in a local tombstone list so a
  // stale server copy couldn't bring them back. Deletions are real ops now; the list only still
  // matters for keeping deleted games out of the one-time catch-up upload.
  function withoutTombstoned(maps: SyncMaps): SyncMaps {
    let removed: number[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(MANUAL_REMOVED_STORAGE_KEY) ?? "null");
      if (Array.isArray(parsed)) removed = parsed;
    } catch {}
    if (!removed.length) return maps;
    return applyOps(
      maps,
      removed.flatMap((appid) =>
        (["manualPlatform", "manualGames", "manualPlaytime"] as const).map((map) => ({
          map,
          appid,
          op: "del" as const,
        })),
      ),
    );
  }

  // The server's copy wins, with this device's own unconfirmed changes replayed on top (see
  // SyncQueue.opsSince). Two exceptions keep data that never reached the server:
  // - no record yet: everything local is uploaded as the first write;
  // - the first pull after the switch to per-entry sync: entries the server has no value for at
  //   all are uploaded once (the old whole-map writes could drop another device's changes, so a
  //   device may hold the only copy). This can bring back something deleted on another device
  //   under the old code - visible, and fixable by deleting it again, unlike silent loss.
  // A device another browser owns (linked: false) uploads neither; it just shows the owner's data.
  function syncFromServer(id: string) {
    const queue = queueFor(id);
    const mark = queue.mark();
    const token = getSyncToken(id);
    lastPullAtRef.current = Date.now();
    fetch(`/api/sync?steamid=${encodeURIComponent(id)}`, {
      headers: token ? { "x-sync-token": token } : undefined,
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.configured) return;
        // Switched accounts while this was in flight - it's the previous account's record.
        if (activeSyncIdRef.current !== null && activeSyncIdRef.current !== id) return;
        setSyncLink(d.linked === true ? "linked" : d.linked === false ? "locked" : "unclaimed");
        const canWrite = d.linked !== false;
        let merged = false;
        try {
          merged = localStorage.getItem(mergedKey(id)) === "1";
          localStorage.setItem(mergedKey(id), "1");
        } catch {}
        const local = withoutTombstoned(currentMaps());
        if (d.exists === false) {
          if (canWrite) queue.enqueue(allEntriesAsOps(local));
        } else {
          const server = emptyMaps();
          for (const map of SYNC_MAPS)
            if (d[map] && typeof d[map] === "object") server[map] = d[map];
          const catchUp = !merged && canWrite ? missingEntriesAsOps(local, server) : [];
          const next = applyOps(server, [...catchUp, ...queue.opsSince(mark)]);
          for (const map of SYNC_MAPS) commit(map, next[map]);
          queue.enqueue(catchUp);
        }
        try {
          localStorage.removeItem(MANUAL_REMOVED_STORAGE_KEY);
        } catch {}
        void queue.flush();
      })
      .catch(() => {});
  }
  // Adopts another device's sync code for the current account, then re-pulls its record. Changes
  // made here while locked out were never this record's, so neither they nor a catch-up upload of
  // this device's local data get written into it.
  function linkSyncCode(code: string): boolean {
    const id = steamId.trim();
    if (!/^\d{17}$/.test(id) || !setSyncToken(id, code)) return false;
    queueFor(id).clear();
    try {
      localStorage.setItem(mergedKey(id), "1");
    } catch {}
    setSyncLink("unknown");
    syncFromServer(id);
    return true;
  }

  // Another device (or tab) may have changed things while this tab sat in the background.
  const syncFromServerRef = useRef(syncFromServer);
  useEffect(() => {
    syncFromServerRef.current = syncFromServer;
  });
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const id = activeSyncIdRef.current;
      if (!id || Date.now() - lastPullAtRef.current < REFOCUS_PULL_MS) return;
      syncFromServerRef.current(id);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return {
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
  };
}
