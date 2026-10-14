"use client";
import { useRef, useState } from "react";
import { type RowComponentProps } from "react-window";
import {
  type Item,
  type View,
  type Game,
  type SortKey,
  type PlayStatus,
  type Rating,
  type StarRating,
  type AchievementInfo,
  type ManualPlatform,
} from "../types";
import {
  type RecommendFit,
  formatMoney,
  lowestPriceStatus,
  scoreClass,
  openLibraryOrStore,
} from "../gameLogic";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_COLORS,
  RATING_EMOJI,
  RATING_LABELS,
  MANUAL_PLATFORM_LABELS,
  ROW_GAP,
} from "../constants";
import { GENRE_LEVELING_ENABLED } from "../genres";
import { StatusGlyph, CoverPlaceholder, StarGlyph, StarPicker } from "./Glyphs";
const RECOMMEND_FIT_LABELS: Record<RecommendFit, string> = {
  good: "잘 맞음",
  mid: "보통",
  bad: "안 맞음",
};
export function GameRow({
  index,
  style,
  items,
  games,
  view,
  statusMap,
  onSetStatus,
  ratingMap,
  onSetRating,
  starMap,
  onSetStar,
  achievementMap,
  checkingAchievements,
  onCheckAchievement,
  rowHeight,
  manualPlatform,
  onRemoveManual,
  onSetManualPlaytime,
  recommendFit,
  sortKey,
  steamId,
  pollMode,
  pollSelected,
  onTogglePollSelect,
}: RowComponentProps<{
  items: Item[];
  games: Record<number, Game>;
  view: View;
  statusMap: Record<number, PlayStatus>;
  onSetStatus: (appid: number, status: PlayStatus | null) => void;
  ratingMap: Record<number, Rating>;
  onSetRating: (appid: number, rating: Rating | null) => void;
  starMap: Record<number, StarRating>;
  onSetStar: (appid: number, star: StarRating | null) => void;
  achievementMap: Record<number, AchievementInfo | null>;
  checkingAchievements: Set<number>;
  onCheckAchievement: (appid: number) => void;
  rowHeight: number;
  manualPlatform: Record<number, ManualPlatform>;
  steamId: string;
  onRemoveManual: (appid: number) => void;
  onSetManualPlaytime: (appid: number, hours: number | null) => void;
  recommendFit: Record<number, RecommendFit>;
  sortKey: SortKey | null;
  pollMode: boolean;
  pollSelected: Set<number>;
  onTogglePollSelect: (appid: number) => void;
}>) {
  const item = items[index];
  const g = games[item.appid];
  const status = statusMap[item.appid];
  const rating = ratingMap[item.appid];
  const star = starMap[item.appid];
  const starPopoverRef = useRef<HTMLDivElement>(null);
  const statusPopoverRef = useRef<HTMLDivElement>(null);
  const [editingPlaytime, setEditingPlaytime] = useState(false);
  const achievement = achievementMap[item.appid];
  const checkingAchievement = checkingAchievements.has(item.appid);
  const recommend =
    GENRE_LEVELING_ENABLED && view === "wishlist" && sortKey === "recommend-desc"
      ? (recommendFit[item.appid] ?? null)
      : null;
  // Negative appids are synthetic (no Steam match), so there's no real store/library page to link
  // to - everything else about a manual entry behaves the same either way.
  // manualPlatform isn't scoped by view (see its comment) - an appid added on the library tab
  // could easily also sit in the wishlist (e.g. wishlisted, then separately hand-added once
  // bought elsewhere), so without the view check here the wishlist row would pick up the
  // library-only playtime/platform badges for it too.
  const manual = view === "library" ? manualPlatform[item.appid] : undefined;
  const linkable = item.appid > 0;
  // A manual entry is never actually owned in this account's library even when it matched a real
  // Steam appid, so the steam:// launch-the-installed-client attempt would just burn its timeout
  // for nothing - go straight to the store page instead. Except manual === "steam": that one
  // really is Steam-owned (just added by hand because it didn't come through the normal sync), so
  // the client launch is worth attempting the same as a genuinely-synced item.
  const tryLibrary = view === "library" && (!manual || manual === "steam");
  const pollChecked = pollMode && pollSelected.has(item.appid);
  return (
    <article
      className={"game" + (pollMode ? " pollActive" : "") + (pollChecked ? " pollSelected" : "")}
      style={{ ...style, height: rowHeight - ROW_GAP }}
      // While poll mode is on, clicking anywhere in the row toggles the checkbox instead of
      // following the cover/title links - preventDefault here cancels the nested <a>'s default
      // navigation even though the click originated on a descendant, since the default action is
      // tied to the event itself, not to whichever element's listener happens to call it.
      onClick={
        pollMode
          ? (e) => {
              e.preventDefault();
              onTogglePollSelect(item.appid);
            }
          : undefined
      }
    >
      {pollMode && (
        <label
          className="pollSelectCheck"
          title="투표 후보로 추가"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={pollSelected.has(item.appid)}
            onChange={() => onTogglePollSelect(item.appid)}
          />
        </label>
      )}
      <div className="coverWrap">
        {linkable ? (
          <a
            className="cover"
            href={`https://store.steampowered.com/app/${item.appid}`}
            target="_blank"
            rel="noopener noreferrer"
            title={
              tryLibrary
                ? "Steam 라이브러리에서 열기 (Steam 미설치 시 상점 페이지)"
                : "스팀 상점 페이지 열기"
            }
            onClick={(e) => {
              if (!tryLibrary || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              openLibraryOrStore(item.appid);
            }}
          >
            {g?.headerImage ? (
              <img src={g.headerImage} alt="" loading="lazy" decoding="async" />
            ) : (
              <CoverPlaceholder loaded={!!g} />
            )}
          </a>
        ) : (
          <div className="cover">
            <CoverPlaceholder loaded />
          </div>
        )}
      </div>
      <div className="info">
        <div className="titleRow">
          <h3>
            {linkable ? (
              <a
                className="storeLink"
                href={`https://store.steampowered.com/app/${item.appid}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!tryLibrary || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  openLibraryOrStore(item.appid);
                }}
                title={
                  tryLibrary
                    ? "Steam 라이브러리에서 열기 (Steam 미설치 시 상점 페이지)"
                    : "스팀 상점 페이지 열기"
                }
              >
                <span className="storeLinkText">{g?.name ?? `Steam App ${item.appid}`}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </a>
            ) : (
              <span className="storeLink" style={{ color: "var(--text)" }}>
                <span className="storeLinkText">{g?.name ?? `Steam App ${item.appid}`}</span>
              </span>
            )}
          </h3>
          {view === "library" && status !== "excluded" && (
            <>
              <button
                type="button"
                className={"titleStarPicker" + (star == null ? " unset" : "")}
                popoverTarget={`star-popover-${item.appid}`}
                title="내 별점 (재미/만족도)"
              >
                <StarGlyph />
                {star != null ? star : "평가 없음"}
              </button>
              <div
                popover="auto"
                id={`star-popover-${item.appid}`}
                className="starPopover"
                ref={starPopoverRef}
              >
                <StarPicker
                  value={star}
                  onChange={(v) => {
                    onSetStar(item.appid, v);
                    starPopoverRef.current?.hidePopover();
                  }}
                />
                {/* StarPicker itself only clears when you tap the exact same half-star spot
                    again, which isn't discoverable on a touch popover with no hover preview -
                    give mobile an explicit clear action. */}
                <button
                  type="button"
                  className="starClearBtn"
                  onClick={() => {
                    onSetStar(item.appid, null);
                    starPopoverRef.current?.hidePopover();
                  }}
                >
                  미평가로 초기화
                </button>
              </div>
            </>
          )}
          {recommend != null && (
            <span
              className={"chip recommendTag " + recommend}
              title="내 라이브러리에서 평가한 취향을 바탕으로 한 매치 정도 (실험적 기능)"
            >
              ✨ {RECOMMEND_FIT_LABELS[recommend]}
            </span>
          )}
        </div>
        <p className="meta">{g?.genres.slice(0, 3).join(" · ") || "게임 정보 불러오는 중"}</p>
        <div className="badges">
          {manual ? (
            editingPlaytime ? (
              <span className="chip playtimeEdit">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  autoFocus
                  defaultValue={item.playtimeMinutes ? item.playtimeMinutes / 60 : ""}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = parseFloat(e.currentTarget.value);
                      onSetManualPlaytime(item.appid, Number.isFinite(v) ? v : null);
                      setEditingPlaytime(false);
                    } else if (e.key === "Escape") {
                      setEditingPlaytime(false);
                    }
                  }}
                  onBlur={(e) => {
                    const v = parseFloat(e.currentTarget.value);
                    onSetManualPlaytime(item.appid, Number.isFinite(v) ? v : null);
                    setEditingPlaytime(false);
                  }}
                />
                시간
              </span>
            ) : (
              <button
                type="button"
                className="chip playtimeChip"
                onClick={() => setEditingPlaytime(true)}
                title="직접 입력한 플레이타임 - 장르 레벨/선호도 계산에 반영됩니다"
              >
                {item.playtimeMinutes != null
                  ? `플레이타임 ${(item.playtimeMinutes / 60).toFixed(1)}시간 (수정)`
                  : "플레이타임 입력"}
              </button>
            )
          ) : item.playtimeMinutes != null ? (
            <span className="chip">플레이타임 {(item.playtimeMinutes / 60).toFixed(1)}시간</span>
          ) : null}
          {manual && (
            <span className="chip manual">
              {MANUAL_PLATFORM_LABELS[manual]}
              <button
                type="button"
                className="manualRemoveBtn"
                onClick={() => onRemoveManual(item.appid)}
                title="목록에서 제거"
              >
                ×
              </button>
            </span>
          )}
          {g?.isDlc && <span className="dlcTag">DLC</span>}
          {view === "wishlist" && g?.price
            ? (() => {
                const lowestPrice = g.lowestPrice;
                const status = lowestPriceStatus(g);
                const atLow = status === "at-low";
                const noData = status === "no-data";
                const notAtLow = status === "not-at-low";
                return (
                  <span
                    className={
                      "chip" +
                      (atLow
                        ? " lowestPriceChip"
                        : noData
                          ? " noPriceData"
                          : notAtLow
                            ? " notLowestPrice"
                            : "")
                    }
                    title={
                      atLow
                        ? "스팀 역대 최저가 (IsThereAnyDeal 기준)"
                        : noData
                          ? "IsThereAnyDeal에 이 게임의 가격 기록 없음"
                          : notAtLow
                            ? `스팀 역대 최저가 아님 (역대 최저 ${formatMoney(lowestPrice!.amount, lowestPrice!.currency)})`
                            : undefined
                    }
                  >
                    {atLow ? "🏷️ " : noData ? "❔ " : notAtLow ? "❌ " : ""}
                    {g.price}
                  </span>
                );
              })()
            : null}
          {view === "wishlist" && g?.discountPercent ? (
            <a
              className="chip discount"
              href={`https://steamdb.info/app/${item.appid}/`}
              target="_blank"
              rel="noopener noreferrer"
              title="SteamDB에서 가격 기록 보기"
              onClick={(e) => e.stopPropagation()}
            >
              -{g.discountPercent}%
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </a>
          ) : null}
          {view === "wishlist" && g?.metacritic != null ? (
            <span className={"chip " + scoreClass(g.metacritic)} title="Metacritic 점수">
              메타 {g.metacritic}
            </span>
          ) : null}
          {view === "wishlist" && g?.reviewPositive ? (
            <span className={"chip " + scoreClass(g.reviewPositive)} title="Steam 리뷰 긍정 비율">
              리뷰 {g.reviewPositive}%
            </span>
          ) : null}
          {achievement != null && achievement.achieved > 0 ? (
            <a
              className={"chip " + scoreClass(achievement.percent)}
              href={`https://steamcommunity.com/profiles/${steamId}/stats/${item.appid}/achievements`}
              target="_blank"
              rel="noopener noreferrer"
              title="Steam에서 업적 목록 보기"
            >
              업적 {achievement.percent}% ({achievement.achieved}/{achievement.total})
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </a>
          ) : view === "library" && achievement === undefined && (!manual || manual === "steam") ? (
            <button
              type="button"
              className="chip pending"
              disabled={checkingAchievement}
              onClick={() => onCheckAchievement(item.appid)}
              title="클릭하면 이 게임의 업적을 바로 확인합니다"
            >
              {checkingAchievement ? "업적 확인 중..." : "업적 확인중 (클릭)"}
            </button>
          ) : null}
          {g && !g.koreanSupported ? (
            <span
              className="chip bad"
              title="인터페이스/자막/더빙 중 하나라도 한국어를 지원하는지 여부"
            >
              한국어 미지원
            </span>
          ) : null}
          {g?.comingSoon ? (
            <span className="chip">{g.releaseUnannounced ? "출시 미정" : "출시 예정"}</span>
          ) : null}
        </div>
        {view === "wishlist" && (g?.releaseDate || g?.discountEndDate) ? (
          <p className="meta">
            {g.releaseDate && <>출시일 {g.releaseDate}</>}
            {g.releaseDate && g.discountEndDate && " · "}
            {g.discountEndDate && <>할인 종료일 {g.discountEndDate}</>}
          </p>
        ) : null}
        {view === "library" ? (
          <div className="statusRow">
            <button
              type="button"
              className={"statusPicker" + (status == null ? " unset" : "")}
              popoverTarget={`status-popover-${item.appid}`}
              title="진행 상태"
              style={status ? { color: STATUS_COLORS[status] } : undefined}
            >
              {status && <StatusGlyph status={status} />}
              {status ? STATUS_LABELS[status] : "상태 없음"}
            </button>
            <div
              popover="auto"
              id={`status-popover-${item.appid}`}
              className="statusPopover"
              ref={statusPopoverRef}
            >
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={"statusOption " + (status === s ? "active" : "")}
                  style={{
                    color: STATUS_COLORS[s],
                    ...(status === s
                      ? { background: STATUS_COLORS[s] + "29", borderColor: STATUS_COLORS[s] }
                      : {}),
                  }}
                  onClick={() => {
                    onSetStatus(item.appid, status === s ? null : s);
                    statusPopoverRef.current?.hidePopover();
                  }}
                >
                  <StatusGlyph status={s} />
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {status !== "excluded" && (
              <span className="ratingChips">
                {(["like", "dislike"] as const)
                  .filter((r) => !rating || rating === r)
                  .map((r) => (
                    <button
                      key={r}
                      className={"ratingChip " + (rating === r ? "active" : "")}
                      title={RATING_LABELS[r]}
                      onClick={() => onSetRating(item.appid, rating === r ? null : r)}
                    >
                      {RATING_EMOJI[r]}
                    </button>
                  ))}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
