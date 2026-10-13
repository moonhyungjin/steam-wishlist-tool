import type { Metadata } from "next";
import { Redis } from "@upstash/redis";
import type { PollData } from "../../api/poll/route";
import { OG_IMAGE } from "../../siteMeta";

// The poll page itself is a client component (it needs state/localStorage), which can't export
// metadata - so the per-poll <title> and link-preview tags come from this server layout instead.
// Without it every shared poll link showed the site-wide "My Steam Wishlist" title, both in the
// browser tab and in the preview card chat apps build from the page's og: tags.
let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

const SITE = "My Steam Wishlist";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pollId: string }>;
}): Promise<Metadata> {
  const { pollId } = await params;
  let data: PollData | null = null;
  try {
    data = (await getRedis()?.get<PollData>(`poll:${pollId}`)) ?? null;
  } catch {}

  if (!data) {
    return { title: `투표를 찾을 수 없어요 · ${SITE}` };
  }

  const question = data.question || "어떤 게임을 살까요?";
  const title = `${question} · ${SITE}`;
  const names = data.candidates.map((c) => c.name);
  const description = `${names.length}개 후보 중에 골라 투표해 주세요: ${names.join(", ")}`;
  // Always the app's own preview image, not a candidate's cover: a cover would show just one of
  // the options and read as if that game were the favorite. The question and candidate names
  // already ride along in the title/description.
  return {
    title,
    description,
    openGraph: {
      title: question,
      description,
      siteName: SITE,
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: question, description, images: [OG_IMAGE.url] },
  };
}

export default function PollLayout({ children }: { children: React.ReactNode }) {
  return children;
}
