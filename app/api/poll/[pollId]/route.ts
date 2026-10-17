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
// for its own UI, and sends that back as `previousAppid` when changing a vote so this endpoint can
// move the count instead of just adding a second one.
//
// Counting is compare-and-set: read the record, count in JS, then write only if the record is
// still exactly what was read (checked and written inside Redis by one script), else re-read and
// retry. Two votes landing together can no longer both start from the same counts and have the
// later write drop the earlier vote. Not a Lua JSON merge: Upstash's cjson drops null fields
// (a candidate's headerImage) when re-encoding. Re-applying the TTL on every vote (instead of
// KEEPTTL) is deliberate - a poll that's still getting votes should keep living a bit longer.
const CAS_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;
const MAX_VOTE_ATTEMPTS = 25;

// The compare needs the stored text byte for byte, so this client skips Upstash's JSON parsing.
let rawRedis: Redis | null | undefined;
function getRawRedis(): Redis | null {
  if (rawRedis !== undefined) return rawRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  rawRedis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
  return rawRedis;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> },
) {
  const { pollId } = await params;
  const body = await request.json().catch(() => null);
  const appid = Number(body?.appid);
  const previousAppid = body?.previousAppid != null ? Number(body.previousAppid) : null;
  const client = getRawRedis();
  if (!client)
    return NextResponse.json({ error: "서버 DB가 설정되어 있지 않습니다." }, { status: 503 });

  const key = `poll:${pollId}`;
  for (let attempt = 0; attempt < MAX_VOTE_ATTEMPTS; attempt++) {
    const raw = await client.get<string>(key);
    if (!raw)
      return NextResponse.json(
        { error: "투표를 찾을 수 없어요. 링크가 만료(30일) 되었거나 잘못됐을 수 있어요." },
        { status: 404 },
      );
    const data: PollData = JSON.parse(raw);
    if (!Number.isInteger(appid) || !(appid in data.votes))
      return NextResponse.json({ error: "유효하지 않은 후보예요." }, { status: 400 });
    if (previousAppid != null && !(previousAppid in data.votes))
      return NextResponse.json({ error: "유효하지 않은 이전 후보예요." }, { status: 400 });
    if (previousAppid === appid) return NextResponse.json(data);

    if (previousAppid != null) {
      data.votes[previousAppid] = Math.max(0, (data.votes[previousAppid] ?? 0) - 1);
    }
    data.votes[appid] = (data.votes[appid] ?? 0) + 1;
    const written = await client.eval(
      CAS_SCRIPT,
      [key],
      [raw, JSON.stringify(data), String(POLL_TTL_SECONDS)],
    );
    if (Number(written) === 1) return NextResponse.json(data);
    // Someone else's vote landed in between - back off (longer each time, randomized so racing
    // voters spread out) and count again on top of it.
    await new Promise((r) => setTimeout(r, (10 + Math.random() * 40) * (1 + attempt / 3)));
  }
  return NextResponse.json(
    { error: "투표가 몰려서 저장하지 못했어요. 다시 눌러주세요." },
    { status: 503 },
  );
}
