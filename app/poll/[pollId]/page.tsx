"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PollCandidate = { appid: number; name: string; headerImage: string | null; price: string };
type PollData = { createdAt: number; candidates: PollCandidate[]; votes: Record<number, number> };

function votedKey(pollId: string) {
  return `poll-voted:${pollId}`;
}

export default function PollPage() {
  const params = useParams<{ pollId: string }>();
  const pollId = params.pollId;
  const [data, setData] = useState<PollData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [votedFor, setVotedFor] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);

  useEffect(() => {
    if (!pollId) return;
    fetch(`/api/poll/${pollId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "불러오지 못했어요.");
        return body as PollData;
      })
      .then(setData)
      .catch((err) => setError(err.message));
    try {
      const raw = localStorage.getItem(votedKey(pollId));
      if (raw) setVotedFor(Number(raw));
    } catch {}
  }, [pollId]);

  async function vote(appid: number) {
    // Clicking the same card you already picked is a no-op, not a re-vote.
    if (appid === votedFor || submitting != null) return;
    setSubmitting(appid);
    try {
      const res = await fetch(`/api/poll/${pollId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid, previousAppid: votedFor }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "투표하지 못했어요.");
      setData(body as PollData);
      setVotedFor(appid);
      try {
        localStorage.setItem(votedKey(pollId), String(appid));
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : "투표하지 못했어요.");
    } finally {
      setSubmitting(null);
    }
  }

  if (error) {
    return (
      <div className="pollPage">
        <div className="pollEmpty">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="pollPage">
        <div className="pollEmpty">불러오는 중...</div>
      </div>
    );
  }

  const totalVotes = Object.values(data.votes).reduce((a, b) => a + b, 0);
  const showResults = votedFor != null;
  const maxVotes = Math.max(0, ...Object.values(data.votes));

  return (
    <div className="pollPage">
      <h1 className="pollTitle">어떤 게임을 살까요?</h1>
      <p className="pollSubtitle">
        {showResults
          ? "투표해주셔서 감사해요! 다른 게임을 누르면 투표를 바꿀 수 있어요."
          : "마음에 드는 게임을 골라주세요."}
      </p>
      <div className="pollList">
        {data.candidates.map((c) => {
          const count = data.votes[c.appid] ?? 0;
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
          const isPicked = votedFor === c.appid;
          const isTop = showResults && maxVotes > 0 && count === maxVotes;
          return (
            <button
              key={c.appid}
              type="button"
              className={"pollCard" + (isPicked ? " picked" : "") + (isTop ? " top" : "")}
              onClick={() => vote(c.appid)}
              disabled={isPicked || submitting != null}
            >
              <div className="pollCardImgWrap">
                {c.headerImage ? (
                  <img className="pollCardImg" src={c.headerImage} alt="" loading="lazy" />
                ) : (
                  <div className="pollCardImg pollCardImgPlaceholder" />
                )}
                {isTop && (
                  <span className="pollTopBadge" title="현재 1위">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 3v18h2v-7h11l-3-4 3-4H7V3H5z" />
                    </svg>
                  </span>
                )}
              </div>
              <div className="pollCardInfo">
                <div className="pollCardName">{c.name}</div>
                <div className="pollCardPrice">{c.price}</div>
              </div>
              {showResults && (
                <div className="pollResultBar">
                  <div className="pollResultFill" style={{ width: `${pct}%` }} />
                  <span className="pollResultLabel">
                    {pct}% · {count}표
                  </span>
                </div>
              )}
              {submitting === c.appid && <span className="pollVotingLabel">투표 중...</span>}
            </button>
          );
        })}
      </div>
      {!showResults && <div className="pollHint">하나를 클릭하면 바로 투표돼요.</div>}
    </div>
  );
}
