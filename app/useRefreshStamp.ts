"use client";
import { useEffect, useState } from "react";
import type { View } from "./types";
import { REFRESHED_AT_STORAGE_KEYS, REFRESH_STALE_MS } from "./constants";
import { refreshStatus } from "./gameLogic";

// Remembers when each tab was last re-fetched so the refresh button can show a "due" dot once the
// data is a day old. `now` re-ticks every minute and when the tab becomes visible again, so a tab
// left open overnight picks the dot up without a reload.
export function useRefreshStamp() {
  const [stamps, setStamps] = useState<Partial<Record<View, number>>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    try {
      const read = (k: string) => {
        const n = Number(localStorage.getItem(k));
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStamps({
        wishlist: read(REFRESHED_AT_STORAGE_KEYS.wishlist),
        library: read(REFRESHED_AT_STORAGE_KEYS.library),
      });
    } catch {}
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  function markRefreshed(view: View) {
    const t = Date.now();
    setStamps((prev) => ({ ...prev, [view]: t }));
    setNow(t);
    try {
      localStorage.setItem(REFRESHED_AT_STORAGE_KEYS[view], String(t));
    } catch {}
  }
  function statusFor(view: View) {
    return refreshStatus(stamps[view], now, REFRESH_STALE_MS);
  }
  return { markRefreshed, statusFor };
}
