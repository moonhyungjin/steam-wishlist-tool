"use client";
import { useEffect, useState } from "react";
import type { Game, View } from "./types";

export function usePoll(view: View, games: Record<number, Game>, steamId: string) {
  // Poll creation - pick a few games and get a login-free, shareable /poll/[pollId] link.
  // Two separate polls live behind this one piece of state: "buy" (wishlist - which to buy) and
  // "play" (library - which to play next). They're mutually exclusive and each only makes sense
  // on its own tab, so pollKind carries which one is active (or null) instead of a plain boolean -
  // that's what lets the UI show the right button/question per tab instead of one poll leaking
  // into the other view. Candidates are a creation-time snapshot (name/image/price), so price
  // changes during voting don't affect an already-created poll.
  const [pollKind, setPollKind] = useState<"buy" | "play" | null>(null);
  const [pollSelected, setPollSelected] = useState<Set<number>>(new Set());
  const [pollShowSelectedOnly, setPollShowSelectedOnly] = useState(false);
  const [pollCreating, setPollCreating] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollLink, setPollLink] = useState<string | null>(null);
  // True only when a poll is active AND it's the one that belongs to the tab currently showing -
  // e.g. a "buy" poll started on the wishlist tab stays "active" in state but isn't rendered once
  // the user switches to the library tab, rather than its bar/checkboxes leaking into that view.
  const pollActiveForView =
    (pollKind === "buy" && view === "wishlist") || (pollKind === "play" && view === "library");
  function resetPollState() {
    setPollSelected(new Set());
    setPollShowSelectedOnly(false);
    setPollError(null);
    setPollLink(null);
  }
  function togglePollMode(kind: "buy" | "play") {
    setPollKind((cur) => (cur === kind ? null : kind));
    resetPollState();
  }
  function closePollMode() {
    setPollKind(null);
    resetPollState();
  }
  // Switching tabs away from the one a poll belongs to closes it outright (not just hides the UI) -
  // the user has to start over on whichever tab's poll they actually want, rather than stale
  // selections from one tab's poll silently carrying over if they switch back.
  useEffect(() => {
    if (pollKind === "buy" && view !== "wishlist") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPollKind(null);
      resetPollState();
    } else if (pollKind === "play" && view !== "library") {
      setPollKind(null);
      resetPollState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  function togglePollSelect(appid: number) {
    setPollSelected((cur) => {
      const next = new Set(cur);
      if (next.has(appid)) next.delete(appid);
      else if (next.size < 8) next.add(appid);
      return next;
    });
  }
  async function createPoll() {
    const candidates = [...pollSelected].map((appid) => {
      const g = games[appid];
      return {
        appid,
        name: g?.name ?? String(appid),
        headerImage: g?.headerImage ?? null,
        price: g?.price ?? "정보 없음",
      };
    });
    const question = pollKind === "play" ? "어떤 게임을 먼저 할까요?" : "어떤 게임을 살까요?";
    setPollCreating(true);
    setPollError(null);
    try {
      const res = await fetch("/api/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates, question, ownerSteamId: steamId.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "투표를 만들지 못했어요.");
      setPollLink(`${location.origin}/poll/${body.pollId}`);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "투표를 만들지 못했어요.");
    } finally {
      setPollCreating(false);
    }
  }
  return {
    pollKind,
    pollSelected,
    pollShowSelectedOnly,
    setPollShowSelectedOnly,
    pollCreating,
    pollError,
    pollLink,
    pollActiveForView,
    resetPollState,
    togglePollMode,
    closePollMode,
    togglePollSelect,
    createPoll,
  };
}
