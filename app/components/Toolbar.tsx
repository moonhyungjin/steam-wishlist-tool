"use client";
import type { FilterState } from "../useFilterState";
import { type Item, type View } from "../types";
import { countryLabel } from "../countries";
export function Toolbar({
  filters,
  country,
  filteredItems,
  hasActiveFilter,
  items,
  layoutMode,
  loadActive,
  loading,
  moreActionsOpen,
  moreActionsWrapRef,
  pollActiveForView,
  setCountryOpen,
  setLayoutMode,
  setManualFormOpen,
  setMoreActionsOpen,
  setMyPollsOpen,
  togglePollMode,
  view,
}: {
  filters: FilterState;
  country: string;
  filteredItems: Item[];
  hasActiveFilter: boolean;
  items: Item[];
  layoutMode: "list" | "card";
  loadActive: () => Promise<void>;
  loading: boolean;
  moreActionsOpen: boolean;
  moreActionsWrapRef: React.RefObject<HTMLDivElement | null>;
  pollActiveForView: boolean;
  setCountryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLayoutMode: React.Dispatch<React.SetStateAction<"list" | "card">>;
  setManualFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMoreActionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMyPollsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  togglePollMode: (kind: "buy" | "play") => void;
  view: View;
}) {
  const { nameQuery, setMobileFiltersOpen, setNameQuery } = filters;
  return (
    <div className="sectionHead">
      <h2>{view === "wishlist" ? "Wishlist" : "Library"}</h2>
      <div className="searchRow">
        <button
          type="button"
          className={"mobileFilterBtn " + (hasActiveFilter ? "active" : "")}
          onClick={() => setMobileFiltersOpen(true)}
          title="필터"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="4" y1="6" x2="20" y2="6" strokeWidth="2" strokeLinecap="round" />
            <line x1="7" y1="12" x2="17" y2="12" strokeWidth="2" strokeLinecap="round" />
            <line x1="10" y1="18" x2="14" y2="18" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <input
          className="searchInput"
          type="text"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="게임 이름 검색"
        />
      </div>
      <div className="headRight">
        <span className="itemCount">
          <span className="itemCountLabel">{view === "wishlist" ? "찜목록" : "보유 게임"} </span>
          {filteredItems.length} / {items.length}개
        </span>
        <button
          type="button"
          className="refreshBtn"
          onClick={loadActive}
          disabled={loading}
          title={
            view === "wishlist"
              ? "찜목록 새로고침"
              : "라이브러리 새로고침 (최근 플레이한 게임 업적 포함)"
          }
        >
          <svg
            className={loading ? "spinning" : ""}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
        <div className="layoutToggle">
          <button
            type="button"
            className={"layoutToggleBtn " + (layoutMode === "list" ? "active" : "")}
            onClick={() => setLayoutMode("list")}
            title="리스트형"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="5" width="4" height="4" />
              <rect x="10" y="5" width="10" height="4" />
              <rect x="4" y="15" width="4" height="4" />
              <rect x="10" y="15" width="10" height="4" />
            </svg>
          </button>
          <button
            type="button"
            className={"layoutToggleBtn " + (layoutMode === "card" ? "active" : "")}
            onClick={() => setLayoutMode("card")}
            title="카드형"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="8" height="8" />
              <rect x="13" y="3" width="8" height="8" />
              <rect x="3" y="13" width="8" height="8" />
              <rect x="13" y="13" width="8" height="8" />
            </svg>
          </button>
        </div>
        <div className="moreActionsWrap" ref={moreActionsWrapRef}>
          <button
            type="button"
            className={"refreshBtn" + (pollActiveForView ? " active" : "")}
            onClick={() => setMoreActionsOpen((v) => !v)}
            title="더보기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          {moreActionsOpen && (
            <div className="moreActionsMenu">
              <button
                type="button"
                className="moreActionsItem"
                onClick={() => {
                  togglePollMode(view === "wishlist" ? "buy" : "play");
                  setMoreActionsOpen(false);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="11" width="4.5" height="9" rx="1" />
                  <rect x="9.75" y="6" width="4.5" height="14" rx="1" />
                  <rect x="16.5" y="3" width="4.5" height="17" rx="1" />
                </svg>
                {view === "wishlist" ? "구매 투표 만들기" : "플레이 투표 만들기"}
              </button>
              <button
                type="button"
                className="moreActionsItem"
                onClick={() => {
                  setMyPollsOpen(true);
                  setMoreActionsOpen(false);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="8" y1="6" x2="20" y2="6" />
                  <line x1="8" y1="12" x2="20" y2="12" />
                  <line x1="8" y1="18" x2="20" y2="18" />
                  <circle cx="4" cy="6" r="0.8" fill="currentColor" />
                  <circle cx="4" cy="12" r="0.8" fill="currentColor" />
                  <circle cx="4" cy="18" r="0.8" fill="currentColor" />
                </svg>
                내가 만든 투표
              </button>
              {view === "library" && (
                <button
                  type="button"
                  className="moreActionsItem"
                  title="Epic/STOVE 등 다른 곳에서 산 게임을 직접 추가"
                  onClick={() => {
                    setManualFormOpen((v) => !v);
                    setMoreActionsOpen(false);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  게임 추가하기
                </button>
              )}
              <div className="moreActionsDivider" />
              {/* 국가 설정 changes the Steam store region (price currency + ITAD low), not the
                  UI language, which stays Korean. About goes to the Korean landing page. */}
              <a href="/about/ko" className="moreActionsItem">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                  <circle cx="12" cy="8" r="0.6" fill="currentColor" />
                </svg>
                About
              </a>
              <button
                type="button"
                className="moreActionsItem"
                onClick={() => {
                  setCountryOpen(true);
                  setMoreActionsOpen(false);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18" />
                  <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
                </svg>
                국가 설정
                <span className="moreActionsTag">{countryLabel(country)}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
