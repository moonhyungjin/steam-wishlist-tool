"use client";
import { useState } from "react";
import type { SyncLinkState } from "../useSyncedData";
import { getSyncToken } from "../syncToken";

// Cross-device sync needs no account: the first browser to save claims the record with a secret
// code, and another device joins by entering that code here. See app/api/sync/route.ts.
export function SyncPanel({
  steamId,
  link,
  onLink,
  onClose,
}: {
  steamId: string;
  link: SyncLinkState;
  onLink: (code: string) => boolean;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const ready = /^\d{17}$/.test(steamId);
  const code = ready ? getSyncToken(steamId) : null;
  return (
    <div className="myPollsPanel">
      <div className="myPollsHead">
        <span className="myPollsTitle">동기화 코드</span>
        <button type="button" className="pollBarBtnGhost" onClick={onClose}>
          닫기
        </button>
      </div>
      {!ready ? (
        <p className="myPollsEmpty">먼저 Steam ID를 입력하고 목록을 불러와 주세요.</p>
      ) : (
        <>
          <p className="myPollsEmpty">
            가입 없이도 진행 상태·평점·직접 추가한 게임이 서버에 저장돼요. 이 기록은 처음 저장한
            기기의 비밀 코드로 보호돼요.
          </p>
          {link === "locked" && (
            <p className="syncNotice warn">
              이 기기는 이 기록에 연결되지 않아 변경 내용이 저장되지 않아요. 기록을 처음 만든 기기의
              코드를 아래에 입력해 주세요.
            </p>
          )}
          {link === "linked" && <p className="syncNotice ok">이 기기가 이 기록에 연결돼 있어요.</p>}
          <div className="syncRow">
            <span className="syncLabel">이 기기의 코드</span>
            <code className="syncCode">
              {code ? (shown ? code : "•".repeat(24)) : "사용할 수 없어요"}
            </code>
            <button type="button" className="pollBarBtnGhost" onClick={() => setShown((v) => !v)}>
              {shown ? "숨기기" : "보기"}
            </button>
            <button
              type="button"
              className="pollBarBtnGhost"
              disabled={!code}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
            >
              {copied ? "복사됨!" : "복사"}
            </button>
          </div>
          <p className="myPollsEmpty">
            코드를 아는 사람은 내 기록을 수정할 수 있으니 공유하지 마세요. 다른 기기에서 이어 쓰려면
            그 기기에 이 코드를 입력하세요.
          </p>
          <form
            className="syncRow"
            onSubmit={(e) => {
              e.preventDefault();
              if (onLink(input)) {
                setInput("");
                setError("");
              } else setError("코드 형식이 올바르지 않아요. (영문 소문자·숫자 64자)");
            }}
          >
            <span className="syncLabel">다른 기기의 코드</span>
            <input
              className="syncInput"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="코드를 붙여 넣으세요"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className="pollBarBtnGhost" disabled={!input.trim()}>
              연결
            </button>
          </form>
          {error && <p className="syncNotice warn">{error}</p>}
        </>
      )}
    </div>
  );
}
