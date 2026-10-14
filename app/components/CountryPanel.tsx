"use client";
import { COUNTRIES } from "../countries";
// Picker for the Steam store region. Switching it changes the price currency and the ITAD all-time
// low the app compares against - never the UI language, which stays Korean.
export function CountryPanel({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="myPollsPanel">
      <div className="myPollsHead">
        <span className="myPollsTitle">스토어 국가</span>
        <button type="button" className="pollBarBtnGhost" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="myPollsEmpty">
        선택한 국가의 스팀 스토어 기준으로 가격과 역대 최저가가 표시돼요. 언어는 한국어 그대로예요.
      </p>
      <div className="countryGrid">
        {COUNTRIES.map((c) => (
          <button
            key={c.code}
            type="button"
            className={"countryOption" + (c.code === current ? " active" : "")}
            onClick={() => onSelect(c.code)}
          >
            {c.label}
            <span className="countryCurrency">{c.currency}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
