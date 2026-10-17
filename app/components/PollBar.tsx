"use client";
import { CloseButton } from "./CloseButton";

export function PollBar({
  closePollMode,
  createPoll,
  pollCreating,
  pollError,
  pollLink,
  pollSelected,
  pollShowSelectedOnly,
  setPollShowSelectedOnly,
}: {
  closePollMode: () => void;
  createPoll: () => Promise<void>;
  pollCreating: boolean;
  pollError: string | null;
  pollLink: string | null;
  pollSelected: Set<number>;
  pollShowSelectedOnly: boolean;
  setPollShowSelectedOnly: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="pollBar">
      {pollLink ? (
        <>
          <span className="pollBarText">투표 링크가 만들어졌어요!</span>
          <input
            className="pollLinkInput"
            readOnly
            value={pollLink}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="pollBarBtn"
            onClick={() => {
              navigator.clipboard?.writeText(pollLink).catch(() => {});
            }}
          >
            복사
          </button>
          <CloseButton className="pollBarClose" onClick={closePollMode} />
        </>
      ) : (
        <>
          <span className="pollBarText">
            {pollSelected.size === 0
              ? "투표에 올릴 게임을 2~8개 체크해주세요."
              : `${pollSelected.size}개 선택됨`}
          </span>
          {pollError && <span className="pollBarError">{pollError}</span>}
          <button
            type="button"
            className="pollBarBtn"
            disabled={pollSelected.size < 2 || pollCreating}
            onClick={createPoll}
          >
            {pollCreating ? "만드는 중..." : "투표 링크 만들기"}
          </button>
          <label className="pollBarCheck">
            <input
              type="checkbox"
              checked={pollShowSelectedOnly}
              onChange={(e) => setPollShowSelectedOnly(e.target.checked)}
            />
            체크한 게임만 보기
          </label>
          <CloseButton className="pollBarClose" label="투표 만들기 닫기" onClick={closePollMode} />
        </>
      )}
    </div>
  );
}
