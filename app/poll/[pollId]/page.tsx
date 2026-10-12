"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PollButton } from "./PollButton";

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
  // votedFor is the last confirmed vote (synced with localStorage); selected is just what's
  // currently highlighted on screen - clicking a card only changes `selected`, nothing is sent to
  // the server until the "투표하기" button is pressed, matching a pick-then-confirm poll instead
  // of voting instantly on click.
  const [votedFor, setVotedFor] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

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
      if (raw) {
        const appid = Number(raw);
        setVotedFor(appid);
        setSelected(appid);
      }
    } catch {}
  }, [pollId]);

  async function submitVote() {
    if (selected == null || selected === votedFor || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/poll/${pollId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid: selected, previousAppid: votedFor }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "투표하지 못했어요.");
      setData(body as PollData);
      setVotedFor(selected);
      try {
        localStorage.setItem(votedKey(pollId), String(selected));
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : "투표하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function shareLink() {
    const url = window.location.href;
    // Native share sheet on mobile (where it's actually available) is nicer than a silent clipboard
    // copy - falls back to copying the link when the Web Share API isn't supported (most desktop
    // browsers) or the user cancels the share sheet.
    if (navigator.share) {
      try {
        await navigator.share({ title: "어떤 게임을 살까요?", url });
        return;
      } catch {
        // AbortError (user closed the share sheet) or any other failure - fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch {}
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
  const canSubmit = selected != null && selected !== votedFor && !submitting;

  return (
    <div className="pollPage">
      <h1 className="pollTitle">어떤 게임을 살까요?</h1>
      <p className="pollSubtitle">
        {showResults
          ? "투표해주셔서 감사해요! 다른 게임을 고르고 다시 투표하기를 누르면 바꿀 수 있어요."
          : "마음에 드는 게임을 고른 다음 투표하기를 눌러주세요."}
      </p>
      <div className="pollList">
        {data.candidates.map((c) => {
          const count = data.votes[c.appid] ?? 0;
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
          const isSelected = selected === c.appid;
          const isTop = showResults && maxVotes > 0 && count === maxVotes;
          return (
            <button
              key={c.appid}
              type="button"
              className={"pollCard" + (isSelected ? " selected" : "") + (isTop ? " top" : "")}
              onClick={() => setSelected(c.appid)}
              disabled={submitting}
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
                      <path d="M6 2a2 2 0 0 0-2 2v18l8-5.5 8 5.5V4a2 2 0 0 0-2-2H6z" />
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
            </button>
          );
        })}
      </div>
      <div className="pollButtonRow">
        <PollButton variant="ghost" onClick={shareLink}>
          {shareCopied ? "링크 복사됨!" : "공유하기"}
        </PollButton>
        <PollButton variant="primary" onClick={submitVote} disabled={!canSubmit}>
          {submitting ? "투표 중..." : showResults ? "다시 투표하기" : "투표하기"}
        </PollButton>
      </div>
    </div>
  );
}
