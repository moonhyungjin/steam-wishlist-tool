import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { POLL_TTL_SECONDS, type PollData } from "../route";

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> },
) {
  const { pollId } = await params;
  const client = getRedis();
  if (!client)
    return NextResponse.json({ error: "서버 DB가 설정되어 있지 않습니다." }, { status: 503 });
  const data = await client.get<PollData>(`poll:${pollId}`);
  if (!data)
    return NextResponse.json(
      { error: "투표를 찾을 수 없어요. 링크가 만료(30일) 되었거나 잘못됐을 수 있어요." },
      { status: 404 },
    );
  return NextResponse.json(data);
}

// Deliberately no per-voter identity/anti-fraud here - this is a casual link shared with a few
// friends, not a public ballot. The client keeps a localStorage "already voted" flag per pollId
// for its own UI; this endpoint just increments a count.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> },
) {
  const { pollId } = await params;
  const body = await request.json().catch(() => null);
  const appid = Number(body?.appid);
  const client = getRedis();
  if (!client)
    return NextResponse.json({ error: "서버 DB가 설정되어 있지 않습니다." }, { status: 503 });

  const key = `poll:${pollId}`;
  const data = await client.get<PollData>(key);
  if (!data)
    return NextResponse.json(
      { error: "투표를 찾을 수 없어요. 링크가 만료(30일) 되었거나 잘못됐을 수 있어요." },
      { status: 404 },
    );
  if (!Number.isInteger(appid) || !(appid in data.votes))
    return NextResponse.json({ error: "유효하지 않은 후보예요." }, { status: 400 });

  data.votes[appid] = (data.votes[appid] ?? 0) + 1;
  // Re-applying the TTL on every vote (instead of a keepttl write) is fine here - a poll that's
  // still getting votes is exactly the one that should keep living a bit longer.
  await client.set(key, data, { ex: POLL_TTL_SECONDS });
  return NextResponse.json(data);
}
