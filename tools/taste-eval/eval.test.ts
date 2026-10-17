// Read-only offline check of the genre-taste recommendation (GENRE_TASTE_ENABLED) on one real
// account - see docs/genre-taste-eval.md for what it measures, the recorded result and how to run.
//
// Reads Steam (library, wishlist, store tags - through the app's own route handlers) and the
// account's sync record straight from Redis with GETs only (the /api/sync route itself would
// migrate a legacy record, i.e. write). Writes nothing except files under EVAL_OUT, which hold the
// account's personal data - the default location is gitignored.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { computeGenreTaste, gameAffinity, recommendScore } from "../../app/gameLogic";
import { GENRE_ALLOWLIST_IDS, TASTE_MIN_GAMES } from "../../app/genres";
import type { AchievementInfo, Game, Item, PlayStatus, Rating, StarRating } from "../../app/types";

const STEAM_ID = process.env.EVAL_STEAM_ID ?? "";
const OUT = process.env.EVAL_OUT ?? "tools/taste-eval/out";
const CACHE = `${OUT}/data-${STEAM_ID}.json`;

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

type Data = {
  libItems: Item[];
  wlItems: Item[];
  games: Record<number, Game>;
  statusMap: Record<number, PlayStatus>;
  ratingMap: Record<number, Rating>;
  starMap: Record<number, StarRating>;
  achievementMap: Record<number, AchievementInfo | null>;
  syncSource: string;
};

async function fetchData(): Promise<Data> {
  const { GET: lib } = await import("../../app/api/library/route");
  const { GET: wl } = await import("../../app/api/wishlist/route");
  const { GET: games } = await import("../../app/api/games/route");
  const get = async (route: (r: NextRequest) => Promise<Response>, url: string) =>
    (await route(new NextRequest(url))).json();
  const libItems: Item[] = (await get(lib, `http://x/api/library?steamid=${STEAM_ID}`)).items;
  const wlItems: Item[] = (await get(wl, `http://x/api/wishlist?steamid=${STEAM_ID}`)).items;
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  let sync: Record<string, Record<number, unknown>> = {};
  let syncSource = "none";
  if (await redis.exists(`sync2:${STEAM_ID}`)) {
    syncSource = "per-entry hashes (sync2)";
    for (const m of [
      "statusMap",
      "ratingMap",
      "starMap",
      "achievementMap",
      "manualGames",
      "manualPlaytime",
    ])
      sync[m] = (await redis.hgetall(`sync2:${STEAM_ID}:${m}`)) ?? {};
  } else {
    const legacy = await redis.get<Record<string, Record<number, unknown>>>(`sync:${STEAM_ID}`);
    if (legacy) [sync, syncSource] = [legacy, "legacy whole-record (sync)"];
  }
  const manualGames = (sync.manualGames ?? {}) as Record<number, Game>;
  const manualPlaytime = (sync.manualPlaytime ?? {}) as Record<number, number>;
  const ids = [...new Set([...libItems, ...wlItems].map((i) => i.appid))];
  const out: Record<number, Game> = { ...manualGames };
  for (let i = 0; i < ids.length; i += 200)
    Object.assign(
      out,
      (await get(games, `http://x/api/games?appids=${ids.slice(i, i + 200).join(",")}&cc=KR`))
        .games ?? {},
    );
  const manualItems: Item[] = Object.keys(manualGames).map((id) => ({
    appid: Number(id),
    playtimeMinutes: manualPlaytime[Number(id)],
  }));
  return {
    libItems: [...libItems, ...manualItems],
    wlItems,
    games: out,
    statusMap: (sync.statusMap ?? {}) as Data["statusMap"],
    ratingMap: (sync.ratingMap ?? {}) as Data["ratingMap"],
    starMap: (sync.starMap ?? {}) as Data["starMap"],
    achievementMap: (sync.achievementMap ?? {}) as Data["achievementMap"],
    syncSource,
  };
}

// The games computeGenreTaste counts: played, not excluded, and fully rated (or dropped).
function counted(d: Data, item: Item): boolean {
  const s = d.statusMap[item.appid];
  if (!(item.playtimeMinutes ?? 0) || s === "excluded") return false;
  return (
    (s != null && d.ratingMap[item.appid] != null && d.starMap[item.appid] != null) ||
    s === "dropped"
  );
}

// computeGenreTaste with two knobs - which tags count, and how a game's hours become weight (for
// both the genre averages and the personal baseline). `skip` leaves one game out.
type Taste = Record<number, { affinity: number; games: number }>;
function taste(d: Data, allow: Set<number>, weight: (h: number) => number, skip?: number): Taste {
  const counts: Record<number, number> = {};
  const w: Record<number, number> = {};
  const wa: Record<number, number> = {};
  let totW = 0;
  let totWA = 0;
  for (const item of d.libItems) {
    if (item.appid === skip || !counted(d, item)) continue;
    const aff = gameAffinity(
      d.statusMap[item.appid],
      d.ratingMap[item.appid],
      d.starMap[item.appid],
      d.achievementMap[item.appid],
    );
    const wt = weight((item.playtimeMinutes ?? 0) / 60);
    totW += wt;
    totWA += wt * aff;
    const ids = (d.games[item.appid]?.genreIds ?? []).filter((id) => allow.has(id));
    for (const id of ids) {
      counts[id] = (counts[id] ?? 0) + 1;
      w[id] = (w[id] ?? 0) + wt / ids.length;
      wa[id] = (wa[id] ?? 0) + (wt / ids.length) * aff;
    }
  }
  const avg = totW > 0 ? totWA / totW : 1;
  const out: Taste = {};
  for (const [id, c] of Object.entries(counts))
    if (c >= TASTE_MIN_GAMES)
      out[Number(id)] = { affinity: wa[Number(id)] / w[Number(id)] - avg + 1, games: c };
  return out;
}

// Ground truth, independent of any weighting: what the player said about the game.
function label(d: Data, appid: number): 1 | 0 | null {
  const [s, r, st] = [d.statusMap[appid], d.ratingMap[appid], d.starMap[appid]];
  if (s === "dropped" || r === "dislike" || (st != null && st <= 2)) return 0;
  if (r === "like" && (st == null || st >= 4)) return 1;
  return null;
}

function auc(pos: number[], neg: number[]): number {
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

it("genre taste vs the review sort, leave-one-out", async () => {
  if (!/^\d{17}$/.test(STEAM_ID)) throw new Error("set EVAL_STEAM_ID to a 17-digit SteamID64");
  mkdirSync(OUT, { recursive: true });
  const d: Data = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : await fetchData();
  if (!existsSync(CACHE)) writeFileSync(CACHE, JSON.stringify(d));
  const L: string[] = [];

  const real = computeGenreTaste(
    d.libItems,
    d.games,
    d.statusMap,
    d.ratingMap,
    d.starMap,
    d.achievementMap,
  );
  const mine = taste(d, GENRE_ALLOWLIST_IDS, (h) => h);
  const drift = Math.max(
    0,
    ...real.map((t) => Math.abs(t.affinity - (mine[t.genreId]?.affinity ?? NaN))),
  );
  const labeled = d.libItems
    .filter((i) => counted(d, i))
    .map((i) => ({ appid: i.appid, y: label(d, i.appid) }))
    .filter((x): x is { appid: number; y: 0 | 1 } => x.y != null);
  const nPos = labeled.filter((x) => x.y === 1).length;
  L.push(`# Data`);
  L.push(`sync: ${d.syncSource}; library ${d.libItems.length}, wishlist ${d.wlItems.length}`);
  L.push(
    `counted by taste: ${d.libItems.filter((i) => counted(d, i)).length}; liked ${nPos}, disliked ${labeled.length - nPos}`,
  );
  L.push(
    `re-implementation vs computeGenreTaste: ${real.length} genres, max diff ${drift.toExponential(1)} (must be ~0)`,
  );

  const scoreAuc = (scoreOf: (appid: number) => number | null) => {
    const pos: number[] = [];
    const neg: number[] = [];
    for (const { appid, y } of labeled) {
      const s = scoreOf(appid);
      if (s != null) (y === 1 ? pos : neg).push(s);
    }
    return { auc: pos.length && neg.length ? auc(pos, neg) : NaN, pos, neg };
  };
  const common: Record<string, number> = { 인디: 492, 어드벤처: 21, 캐주얼: 597 };
  const without = (ids: number[]) =>
    new Set([...GENRE_ALLOWLIST_IDS].filter((x) => !ids.includes(x)));
  const tags: [string, Set<number>][] = [
    ["current tags", GENRE_ALLOWLIST_IDS],
    ...Object.entries(common).map(([n, id]) => [`-${n}`, without([id])] as [string, Set<number>]),
    ["-all three", without(Object.values(common))],
  ];
  const weights: [string, (h: number) => number][] = [
    ["hours (current)", (h) => h],
    ["cap 50h", (h) => Math.min(h, 50)],
    ["cap 20h", (h) => Math.min(h, 20)],
    ["sqrt", Math.sqrt],
    ["equal", () => 1],
  ];
  L.push(``, `# Leave-one-out AUC (P(liked game scores above disliked); 0.5 = random)`);
  L.push(
    `| tags \\ weight | ${weights.map(([n]) => n).join(" | ")} |`,
    `|---|${weights.map(() => "---").join("|")}|`,
  );
  for (const [tn, allow] of tags)
    L.push(
      `| ${tn} | ${weights
        .map(([, wf]) =>
          scoreAuc((a) => recommendScore(d.games[a]?.genreIds, taste(d, allow, wf, a))).auc.toFixed(
            3,
          ),
        )
        .join(" | ")} |`,
    );

  const review = scoreAuc((a) => d.games[a]?.reviewPositive ?? null);
  L.push(``, `# Baselines`, `| method | AUC |`, `|---|---|`);
  L.push(
    `| Steam review positive % (the existing 리뷰 sort, no taste) | ${review.auc.toFixed(3)} |`,
  );
  // Review + taste: z-score each, weighted sum.
  const z = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
    return (x: number) => (x - m) / sd;
  };
  for (const [wn, wf] of [weights[1], weights[4]]) {
    const ts: Record<number, number | null> = {};
    for (const { appid } of labeled)
      ts[appid] = recommendScore(
        d.games[appid]?.genreIds,
        taste(d, GENRE_ALLOWLIST_IDS, wf, appid),
      );
    const both = labeled.filter(
      (x) => ts[x.appid] != null && d.games[x.appid]?.reviewPositive != null,
    );
    const zr = z(both.map((x) => d.games[x.appid].reviewPositive!));
    const zt = z(both.map((x) => ts[x.appid]!));
    for (const share of [0.25, 0.5]) {
      const r = scoreAuc((a) =>
        ts[a] == null || d.games[a]?.reviewPositive == null
          ? null
          : (1 - share) * zr(d.games[a].reviewPositive!) + share * zt(ts[a]!),
      );
      L.push(`| review + taste (${wn}, taste share ${share}) | ${r.auc.toFixed(3)} |`);
    }
  }
  // Hanley-McNeil standard error at the review AUC.
  const [A, n1, n2] = [review.auc, review.pos.length, review.neg.length];
  const q1 = A / (2 - A);
  const q2 = (2 * A * A) / (1 + A);
  const se = Math.sqrt(
    (A * (1 - A) + (n1 - 1) * (q1 - A * A) + (n2 - 1) * (q2 - A * A)) / (n1 * n2),
  );
  L.push(``, `AUC standard error (approx.): ±${se.toFixed(3)}`);
  writeFileSync(`${OUT}/result-${STEAM_ID}.md`, L.join("\n"));
});
