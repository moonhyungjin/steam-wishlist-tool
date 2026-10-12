import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { MAX_LISTED_POLLS, type PollData } from "../poll/route";

// "My polls" - the polls a Steam ID has created, so a creator who closed the link bar without
// copying it can find the poll (and its results) again. Same trust model as /api/sync: keyed by
// the public Steam ID, no login. Poll links are meant to be shared anyway, so nothing here is more
// sensitive than the polls themselves.
let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

export type MyPollSummary = {
  pollId: string;
  question: string;
  createdAt: number;
  candidateCount: number;
  totalVotes: number;
  leader: { name: string; votes: number } | null;
};

export async function GET(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid") ?? "";
  if (!/^\d{17}$/.test(steamId))
    return NextResponse.json({ error: "steamid가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ polls: [] satisfies MyPollSummary[], configured: false });

  const listKey = `mypolls:${steamId}`;
  const ids = await client.zrange<string[]>(listKey, 0, MAX_LISTED_POLLS - 1, { rev: true });
  if (!ids.length) return NextResponse.json({ polls: [], configured: true });

  const stored = await client.mget<(PollData | null)[]>(...ids.map((id) => `poll:${id}`));
  const polls: MyPollSummary[] = [];
  const expired: string[] = [];
  ids.forEach((pollId, i) => {
    const data = stored[i];
    if (!data) {
      expired.push(pollId);
      return;
    }
    const totalVotes = Object.values(data.votes).reduce((a, b) => a + b, 0);
    let leader: MyPollSummary["leader"] = null;
    for (const c of data.candidates) {
      const votes = data.votes[c.appid] ?? 0;
      if (votes > 0 && (!leader || votes > leader.votes)) leader = { name: c.name, votes };
    }
    polls.push({
      pollId,
      question: data.question || "어떤 게임을 살까요?",
      createdAt: data.createdAt,
      candidateCount: data.candidates.length,
      totalVotes,
      leader,
    });
  });
  // The poll itself aged out (30-day TTL) - nothing useful left to show, so drop it from the list.
  if (expired.length) await client.zrem(listKey, ...expired).catch(() => {});
  return NextResponse.json({ polls, configured: true });
}

// Removes a poll from this Steam ID's list only - the poll itself (and its shared link) keeps
// working until its own TTL runs out.
export async function DELETE(request: NextRequest) {
  const steamId = request.nextUrl.searchParams.get("steamid") ?? "";
  const pollId = request.nextUrl.searchParams.get("pollid") ?? "";
  if (!/^\d{17}$/.test(steamId) || !pollId)
    return NextResponse.json({ error: "steamid와 pollid가 필요합니다." }, { status: 400 });
  const client = getRedis();
  if (!client) return NextResponse.json({ ok: false, configured: false });
  await client.zrem(`mypolls:${steamId}`, pollId);
  return NextResponse.json({ ok: true });
}
