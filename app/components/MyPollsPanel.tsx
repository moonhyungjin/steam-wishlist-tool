"use client";
import { useEffect, useState } from "react";
import { type MyPoll } from "../types";
// Lists the polls this Steam ID has created (server-side, see /api/my-polls) so a poll link that
// was never copied can still be found - along with a quick results summary, which is usually what
// the creator came back for. Its own component for the same reason as ManualAddPanel: it holds its
// own fetch/loading state and shouldn't re-render with every keystroke elsewhere in Wishlist.
export function MyPollsPanel({ steamId, onClose }: { steamId: string; onClose: () => void }) {
  const [polls, setPolls] = useState<MyPoll[] | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const validId = /^\d{17}$/.test(steamId);

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    fetch(`/api/my-polls?steamid=${encodeURIComponent(steamId)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || "불러오지 못했어요.");
        return body as { polls: MyPoll[] };
      })
      .then((d) => {
        if (!cancelled) setPolls(d.polls);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [steamId, validId]);

  function copyLink(pollId: string) {
    navigator.clipboard
      ?.writeText(`${location.origin}/poll/${pollId}`)
      .then(() => {
        setCopiedId(pollId);
        setTimeout(() => setCopiedId((cur) => (cur === pollId ? null : cur)), 1500);
      })
      .catch(() => {});
  }
  function removeFromList(pollId: string) {
    setPolls((cur) => cur?.filter((p) => p.pollId !== pollId) ?? cur);
    fetch(
      `/api/my-polls?steamid=${encodeURIComponent(steamId)}&pollid=${encodeURIComponent(pollId)}`,
      { method: "DELETE" },
    ).catch(() => {});
  }

  return (
    <div className="myPollsPanel">
      <div className="myPollsHead">
        <span className="myPollsTitle">내가 만든 투표</span>
        <button type="button" className="pollBarBtnGhost" onClick={onClose}>
          닫기
        </button>
      </div>
      {!validId ? (
        <p className="myPollsEmpty">Steam ID64를 입력해야 내가 만든 투표를 볼 수 있어요.</p>
      ) : error ? (
        <p className="myPollsEmpty">{error}</p>
      ) : polls == null ? (
        <p className="myPollsEmpty">불러오는 중...</p>
      ) : polls.length === 0 ? (
        <p className="myPollsEmpty">
          아직 만든 투표가 없어요. 투표는 만든 지 30일 뒤에 자동으로 사라져요.
        </p>
      ) : (
        <ul className="myPollsList">
          {polls.map((p) => (
            <li key={p.pollId} className="myPollsItem">
              <div className="myPollsInfo">
                <div className="myPollsQuestion">{p.question}</div>
                <div className="myPollsMeta">
                  {new Date(p.createdAt).toLocaleDateString("ko-KR")} · 후보 {p.candidateCount}개 ·{" "}
                  {p.totalVotes === 0
                    ? "아직 투표 없음"
                    : `${p.totalVotes}표${p.leader ? ` · 1위 ${p.leader.name}` : ""}`}
                </div>
              </div>
              <div className="myPollsActions">
                <a
                  className="pollBarBtn"
                  href={`/poll/${p.pollId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  열기
                </a>
                <button
                  type="button"
                  className="pollBarBtnGhost"
                  onClick={() => copyLink(p.pollId)}
                >
                  {copiedId === p.pollId ? "복사됨" : "링크 복사"}
                </button>
                <button
                  type="button"
                  className="pollBarBtnGhost"
                  title="이 목록에서만 지워요 (공유한 링크는 계속 열려요)"
                  onClick={() => removeFromList(p.pollId)}
                >
                  제거
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
