import { DEFAULT_COUNTRY } from "./countries";
import { type Game, type LowestPrice, type AchievementInfo } from "./types";
import { mergeGamesInto } from "./gameLogic";
import { ACHIEVEMENT_CHUNK, CHUNK, META_CHUNK, LOWPRICE_CHUNK, sleep } from "./constants";
// Shared by both loaders: fetch store data for whatever appids aren't already loaded, then keep
// retrying just the still-missing ones a few times at a gentle pace. Returns the cumulative map;
// onProgress is called after every chunk so callers can mirror it into their own state/cache.
export async function enrichGames(
  appids: number[],
  existingGames: Record<number, Game>,
  onProgress: (loaded: Record<number, Game>) => void,
  // A plain page load only needs to fill in whatever's missing from the cache - but an explicit
  // "새로고침"/"가져오기" is the user asking for current data, so it has to re-fetch appids that
  // are already cached too. Without this, price/discount/review fields (which do change over
  // time, unlike name/genres) would never update past their first fetch no matter how many times
  // the user refreshes.
  forceRefresh = false,
  // Store region for prices - see app/countries.ts.
  country: string = DEFAULT_COUNTRY,
): Promise<Record<number, Game>> {
  // Build a new object per update instead of mutating in place - callers pass this straight into
  // setState, and mutating the same reference across calls means React (and any useMemo keyed on
  // it) can't tell later updates happened at all, since it looks like the "same" state each time.
  let loaded: Record<number, Game> = { ...existingGames };
  async function fetchChunk(chunk: number[]): Promise<Record<string, Game> | null> {
    const r = await fetch(`/api/games?appids=${chunk.join(",")}&cc=${country}`);
    const d = await r.json();
    return r.ok ? (d.games ?? {}) : null;
  }
  const missingInitial = appids.filter((id) => forceRefresh || !(id in loaded));
  for (let i = 0; i < missingInitial.length; i += CHUNK) {
    const newGames = await fetchChunk(missingInitial.slice(i, i + CHUNK));
    if (!newGames) continue;
    // Per-game merge (mergeGamesInto), not a wholesale {...loaded, ...newGames} - /api/games
    // doesn't know about metacritic/lowestPrice/lowestPriceCheckedForEnd (those come from their
    // own separate enrichment passes, never part of this response), so a top-level spread would
    // silently wipe them back to "unchecked" on every forced refresh. That defeated both
    // enrichLowestPrice's "skip the same sale" optimization and (mostly harmlessly, thanks to the
    // server-side cache) enrichMetacritic's - a 새로고침 would re-ask for data it already had.
    loaded = mergeGamesInto(loaded, newGames);
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
      loaded = mergeGamesInto(loaded, newGames);
      onProgress(loaded);
    }
  }
  return loaded;
}
// Metacritic only comes from the old per-game endpoint that used to rate-limit the whole app, so
// it's fetched separately, after the fast main load, at a gentle pace - and stops for good the
// moment the server signals it's blocked, instead of ever retrying into that mess again.
// /api/metacritic now caches results server-side (shared across every visitor, permanently - a
// score, or a confirmed absence of one, never changes), so most of this chunk loop resolves from
// cache instantly; only genuinely-new appids hit the slow/fragile live-fetch path at all.
// `undefined` means "not checked yet"; an explicit `null` (real ones come back through
// d.scores, same as a real number - see the route) means "checked, no score" and must not be
// retried again - that permanent-retry bug is exactly what this field used to have before adding
// the undefined state.
export async function enrichMetacritic(
  appids: number[],
  initialGames: Record<number, Game>,
  onUpdate: (games: Record<number, Game>) => void,
) {
  let current = initialGames;
  const missing = appids.filter((id) => current[id] && current[id].metacritic === undefined);
  for (let i = 0; i < missing.length; i += META_CHUNK) {
    const chunk = missing.slice(i, i + META_CHUNK);
    const r = await fetch(`/api/metacritic?appids=${chunk.join(",")}`);
    const d = await r.json();
    if (!r.ok) return;
    const updates: Record<number, Game> = {};
    for (const [id, score] of Object.entries(d.scores ?? {})) {
      const appid = Number(id);
      if (current[appid])
        updates[appid] = { ...current[appid], metacritic: score as number | null };
    }
    current = { ...current, ...updates };
    onUpdate(current);
    if (d.blocked) return;
  }
}
// All-time low price via IsThereAnyDeal - like metacritic, a secondary enrichment pass after the
// main load, not something the initial wishlist fetch waits on. /api/lowestprice caches results
// server-side (shared across every visitor, not per-account), so repeated loads across different
// people mostly hit that cache instead of calling ITAD again.
//
// Client-side, this only re-checks a game when its *discount period* has actually changed - the
// call site already restricts this to currently-discounted appids, so a game simply drops out on
// its own once the sale ends (no explicit "stop checking" needed). What still needed handling:
// a game already checked once during sale A shouldn't get re-checked on every subsequent load for
// the rest of that same sale (its historical low can't have moved since we last asked), but SHOULD
// get re-checked once sale A ends and a later, different sale B starts - B could itself be a new
// record low. lowestPriceCheckedForEnd records which sale's discountEndTimestamp a game's
// lowestPrice was last fetched for, so a differing one signals "new sale, worth asking again."
export async function enrichLowestPrice(
  appids: number[],
  initialGames: Record<number, Game>,
  onUpdate: (games: Record<number, Game>) => void,
  country: string = DEFAULT_COUNTRY,
) {
  let current = initialGames;
  const missing = appids.filter((id) => {
    const g = current[id];
    if (!g) return false;
    if (g.lowestPrice === undefined) return true;
    return g.lowestPriceCheckedForEnd !== g.discountEndTimestamp;
  });
  for (let i = 0; i < missing.length; i += LOWPRICE_CHUNK) {
    const chunk = missing.slice(i, i + LOWPRICE_CHUNK);
    const r = await fetch(`/api/lowestprice?appids=${chunk.join(",")}&cc=${country}`);
    const d = await r.json();
    if (!r.ok) return;
    const updates: Record<number, Game> = {};
    // /api/lowestprice deliberately omits an appid from its response (rather than returning
    // null) when it's stale/missing but past its own per-request refresh cap - that means "not
    // resolved yet," not "confirmed no price." Only appids actually present in the response
    // (`id in prices`, which real `null` results satisfy too) get written here; anything the
    // server skipped stays undefined so the next wishlist load retries it, instead of getting
    // permanently marked "no data" by a fallback that couldn't tell the two cases apart.
    const prices: Record<string, LowestPrice | null> = d.prices ?? {};
    for (const id of chunk) {
      if (!current[id] || !(id in prices)) continue;
      updates[id] = {
        ...current[id],
        lowestPrice: prices[id],
        lowestPriceCheckedForEnd: current[id].discountEndTimestamp,
      };
    }
    current = { ...current, ...updates };
    onUpdate(current);
    if (!d.configured) return;
  }
}
// Achievement completion is per-account, per-game data with no batch endpoint on Steam's side,
// so it's fetched as its own slow background pass (library only) after the main load - a missing
// key means "not checked yet", an explicit null means "checked, this game has no achievements".
export async function enrichAchievements(
  appids: number[],
  steamId: string,
  initial: Record<number, AchievementInfo | null>,
  // Called with just the entries each chunk checked.
  onUpdate: (updates: Record<number, AchievementInfo | null>) => void,
  // Ids in this set get re-fetched even if already in `initial` - everything else only fills in
  // gaps. Achievement % can only change for games actually played since the last check, so
  // "새로고침" only forces the handful of most-recently-played games instead of the whole library -
  // re-checking 500 unplayed-since-last-time games would cost 500 individual Steam API calls
  // (no batch endpoint for this one) for data that almost certainly didn't move.
  forceIds: Set<number> = new Set(),
) {
  const targets = appids.filter((id) => forceIds.has(id) || !(id in initial));
  for (let i = 0; i < targets.length; i += ACHIEVEMENT_CHUNK) {
    const chunk = targets.slice(i, i + ACHIEVEMENT_CHUNK);
    const r = await fetch(
      `/api/achievements?steamid=${encodeURIComponent(steamId)}&appids=${chunk.join(",")}`,
    );
    const d = await r.json();
    if (!r.ok) return;
    const updates: Record<number, AchievementInfo | null> = {};
    for (const [id, info] of Object.entries(d.achievements ?? {})) {
      updates[Number(id)] = info as AchievementInfo | null;
    }
    onUpdate(updates);
    if (d.blocked) return;
  }
}
