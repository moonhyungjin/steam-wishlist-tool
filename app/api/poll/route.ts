import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// Shareable "which game should I buy?" polls - a public, login-free page separate from the rest
// of this app (which always requires a SteamID64). Candidates are a snapshot taken at creation
// time (name/image/price frozen then), not re-fetched live - voters are just picking among a few
// options, so a price changing mid-poll doesn't need to be reflected.
let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

// No reason for these to live forever - a stale poll nobody's looking at anymore should just age
// out of Redis on its own instead of accumulating keys forever.
export const POLL_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_CANDIDATES = 8;
const MIN_CANDIDATES = 2;
const MAX_QUESTION_LENGTH = 60;
// How many of a creator's most recent polls stay in their "my polls" list, and how long that list
// itself lives after their last created poll (longer than a poll's own TTL, so the list never
// disappears out from under a still-live poll).
export const MAX_LISTED_POLLS = 30;
export const MY_POLLS_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_QUESTION = "어떤 게임을 살까요?";

export type PollCandidate = {
  appid: number;
  name: string;
  headerImage: string | null;
  price: string;
};
export type PollData = {
  createdAt: number;
  question: string;
  candidates: PollCandidate[];
  votes: Record<number, number>;
};

// Short, URL-friendly, not globally unique-guaranteed but collision odds are negligible at this
// app's scale - no need for a real UUID in the link.
function makePollId(): string {
  return (
    Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 7)
  ).slice(0, 9);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const raw: Array<Record<string, unknown>> = Array.isArray(body?.candidates)
    ? body.candidates
    : [];
  const candidates: PollCandidate[] = raw
    .map((c) => ({
      appid: Number(c?.appid),
      name: String(c?.name ?? "").trim(),
      headerImage: typeof c?.headerImage === "string" ? c.headerImage : null,
      price: typeof c?.price === "string" ? c.price : "정보 없음",
    }))
    .filter((c) => Number.isInteger(c.appid) && c.name)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length < MIN_CANDIDATES)
    return NextResponse.json(
      { error: `후보 게임을 ${MIN_CANDIDATES}개 이상 선택해주세요.` },
      { status: 400 },
    );

  const rawQuestion = typeof body?.question === "string" ? body.question.trim() : "";
  const question = (rawQuestion || DEFAULT_QUESTION).slice(0, MAX_QUESTION_LENGTH);

  const client = getRedis();
  if (!client)
    return NextResponse.json({ error: "서버 DB가 설정되어 있지 않습니다." }, { status: 503 });

  const votes: Record<number, number> = {};
  for (const c of candidates) votes[c.appid] = 0;
  const pollId = makePollId();
  const data: PollData = { createdAt: Date.now(), question, candidates, votes };
  await client.set(`poll:${pollId}`, data, { ex: POLL_TTL_SECONDS });

  // Record the poll under its creator's Steam ID so they can find the link again later (see
  // /api/my-polls). Done server-side at creation instead of through /api/sync: that endpoint
  // overwrites the whole record on every write, so adding a field there would let any stale
  // client silently wipe it - this is an append-only sorted set with nothing to merge. Best
  // effort: failing to record it must never fail the poll creation itself.
  const owner = typeof body?.ownerSteamId === "string" ? body.ownerSteamId : "";
  if (/^\d{17}$/.test(owner)) {
    try {
      const listKey = `mypolls:${owner}`;
      await client.zadd(listKey, { score: data.createdAt, member: pollId });
      await client.zremrangebyrank(listKey, 0, -(MAX_LISTED_POLLS + 1));
      await client.expire(listKey, MY_POLLS_TTL_SECONDS);
    } catch {}
  }
  return NextResponse.json({ pollId });
}
