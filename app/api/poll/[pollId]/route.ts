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
// The read-check-count-write runs inside Redis as one script, so two votes landing at the same
// moment can't both read the same old counts and have the later write drop the earlier vote. The
// record keeps its plain-JSON shape (votes inside it), so GET, /api/my-polls and polls created
// before this change need nothing different. Re-applying the TTL on every vote (instead of
// KEEPTTL) is deliberate - a poll that's still getting votes should keep living a bit longer.
const VOTE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'missing' end
local data = cjson.decode(raw)
local appid, prev = ARGV[1], ARGV[2]
if data.votes[appid] == nil then return 'bad' end
if prev ~= '' and data.votes[prev] == nil then return 'badprev' end
if prev ~= appid then
  if prev ~= '' then data.votes[prev] = math.max(0, data.votes[prev] - 1) end
  data.votes[appid] = data.votes[appid] + 1
end
local out = cjson.encode(data)
redis.call('SET', KEYS[1], out, 'EX', tonumber(ARGV[3]))
return out
`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> },
) {
  const { pollId } = await params;
  const body = await request.json().catch(() => null);
  const appid = Number(body?.appid);
  const previousAppid = body?.previousAppid != null ? Number(body.previousAppid) : null;
  const client = getRedis();
  if (!client)
    return NextResponse.json({ error: "서버 DB가 설정되어 있지 않습니다." }, { status: 503 });

  if (!Number.isInteger(appid))
    return NextResponse.json({ error: "유효하지 않은 후보예요." }, { status: 400 });
  if (previousAppid != null && !Number.isInteger(previousAppid))
    return NextResponse.json({ error: "유효하지 않은 이전 후보예요." }, { status: 400 });

  const result = await client.eval<string[], string | PollData>(
    VOTE_SCRIPT,
    [`poll:${pollId}`],
    [String(appid), previousAppid != null ? String(previousAppid) : "", String(POLL_TTL_SECONDS)],
  );
  if (result === "missing")
    return NextResponse.json(
      { error: "투표를 찾을 수 없어요. 링크가 만료(30일) 되었거나 잘못됐을 수 있어요." },
      { status: 404 },
    );
  if (result === "bad")
    return NextResponse.json({ error: "유효하지 않은 후보예요." }, { status: 400 });
  if (result === "badprev")
    return NextResponse.json({ error: "유효하지 않은 이전 후보예요." }, { status: 400 });
  // Upstash JSON-parses string replies by default; parse here only in case that's ever turned off.
  const data: PollData = typeof result === "string" ? JSON.parse(result) : result;
  return NextResponse.json(data);
}
