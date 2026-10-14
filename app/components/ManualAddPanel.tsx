"use client";
import { useEffect, useState } from "react";
import { type Game, type ManualPlatform } from "../types";
import { blankGame } from "../gameLogic";
import { MANUAL_PLATFORM_LABELS } from "../constants";
import { enrichGames } from "../enrich";
// Split out from Wishlist so typing in the search box only re-renders this small panel instead of
// the entire app - manualQuery lived in Wishlist's own state before, and every keystroke was
// re-rendering the whole sidebar (every FilterGroup) plus the virtualized list/grid's rowProps/
// cellProps (fresh object each render, so react-window couldn't skip re-rendering visible rows
// either), which is exactly why typing felt laggy despite the input itself doing very little.
export function ManualAddPanel({
  onAdd,
  onClose,
  country,
}: {
  onAdd: (appid: number, platform: ManualPlatform, game: Game) => void;
  onClose: () => void;
  country: string;
}) {
  const [manualQuery, setManualQuery] = useState("");
  const [manualPlatformChoice, setManualPlatformChoice] = useState<ManualPlatform>("epic");
  // Steam's public search "type" field is unreliable for real DLC - e.g. "Songs of Conquest -
  // Yulan" (a genuine DLC pack) comes back as type "app", not "dlc", so isDlc from the search
  // result alone misses real cases. This is a manual override the user can check before adding,
  // OR'd with whatever the search result itself reported (so a result Steam does correctly flag
  // still shows DLC even if this happens to be unchecked).
  const [manualIsDlcChoice, setManualIsDlcChoice] = useState(false);
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
      fetch(`/api/search-game?term=${encodeURIComponent(manualQuery.trim())}&cc=${country}`)
        .then((r) => r.json())
        .then((d) => setManualResults(d.items ?? []))
        .catch(() => setManualResults([]))
        .finally(() => setManualSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [manualQuery, isComposing, country]);
  // Adding a game shouldn't close the whole panel - clearing just the query/results (autoFocus
  // on the input keeps focus) lets the user search-then-add the next game right away, which is
  // what actually makes adding several games in a row fast.
  function confirmManualAdd(name: string) {
    setManualQuery("");
    setManualResults([]);
    setLastAddedName(name);
    setTimeout(() => setLastAddedName((cur) => (cur === name ? null : cur)), 2000);
  }
  async function addManualMatched(appid: number, name: string, isDlc: boolean) {
    setManualAdding(true);
    try {
      const loaded = await enrichGames([appid], {}, () => {}, false, country);
      // /api/games (the store-page lookup enrichGames uses) has no DLC signal of its own - only
      // the search step that found this result knows, so carry it over explicitly here.
      const game = { ...(loaded[appid] ?? blankGame(appid, name)), isDlc };
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
    onAdd(appid, manualPlatformChoice, { ...blankGame(appid, name), isDlc: manualIsDlcChoice });
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
          <label
            className="manualDlcCheck"
            title="Steam 검색이 DLC로 인식하지 못하는 경우가 있어서(예: 확장팩이 일반 게임으로 분류됨) 직접 표시할 수 있습니다"
          >
            <input
              type="checkbox"
              checked={manualIsDlcChoice}
              onChange={() => setManualIsDlcChoice((v) => !v)}
            />
            DLC
          </label>
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
                onClick={() => addManualMatched(r.appid, r.name, !!r.isDlc || manualIsDlcChoice)}
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
