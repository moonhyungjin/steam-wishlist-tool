"use client";
import type { GenreBreakdown } from "../gameLogic";
import { useState, type CSSProperties } from "react";
import { type View, type Profile } from "../types";
import { TASTE_PCT_DOMAIN } from "../genres";
import { GenreGlyph, GENRE_ICON_PARENT, GenreRadar } from "./GenreGlyph";
export function AccountHeader({
  formVisible,
  genreLevels,
  genreBreakdown,
  genreTab,
  genreTaste,
  loadActive,
  loading,
  openCredsForm,
  profile,
  profileLoading,
  rememberMe,
  setGenreTab,
  setRememberMe,
  setSteamId,
  showGenreLevels,
  steamId,
  view,
}: {
  formVisible: boolean;
  genreLevels: { level: number; progress: number; genreId: number; genre: string; hours: number }[];
  genreBreakdown: Record<number, GenreBreakdown>;
  genreTab: "level" | "taste";
  genreTaste: { genreId: number; genre: string; games: number; affinity: number }[];
  loadActive: () => Promise<void>;
  loading: boolean;
  openCredsForm: () => void;
  profile: Profile | null;
  profileLoading: boolean;
  rememberMe: boolean;
  setGenreTab: React.Dispatch<React.SetStateAction<"level" | "taste">>;
  setRememberMe: React.Dispatch<React.SetStateAction<boolean>>;
  setSteamId: React.Dispatch<React.SetStateAction<string>>;
  showGenreLevels: boolean;
  steamId: string;
  view: View;
}) {
  // Which broad genre rows in the level tab are expanded to show their sub-genre breakdown.
  const [expandedGenres, setExpandedGenres] = useState<Set<number>>(() => new Set());
  function toggleExpanded(genreId: number) {
    setExpandedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(genreId)) next.delete(genreId);
      else next.add(genreId);
      return next;
    });
  }
  return (
    <header>
      <p className="eyebrow">PERSONAL STEAM TOOL</p>
      <h1>{view === "wishlist" ? "My Steam Wishlist" : "My Steam Library"}</h1>
      {!formVisible && (
        <div className="profileRow">
          {profile && (
            <div className="profileCard">
              {profile.avatarUrl && (
                <a
                  className="profileAvatarLink"
                  href={profile.profileUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Steam 프로필 열기"
                >
                  <img className="profileAvatar" src={profile.avatarUrl} alt="" />
                </a>
              )}
              <div className="profileCardText">
                {showGenreLevels && (
                  <div className="profileTopGenre">
                    <button
                      type="button"
                      className="genreLevelBadge"
                      popoverTarget="genre-level-popover"
                      title={
                        genreTaste[0]
                          ? `선호 1위: ${genreTaste[0].genre} (${
                              Math.round((genreTaste[0].affinity - 1) * 100) >= 0 ? "+" : ""
                            }${Math.round((genreTaste[0].affinity - 1) * 100)}%)`
                          : undefined
                      }
                    >
                      <GenreGlyph genreId={genreLevels[0].genreId} className="genreGlyph" />
                      {genreLevels[0].genre} <b>Lv.{genreLevels[0].level}</b>
                    </button>
                  </div>
                )}
                <span className="profileName">{profile.personaName}</span>
              </div>
            </div>
          )}
          {!profile && profileLoading && (
            <div className="profileCard">
              <span className="profileAvatar skeletonBlock" />
              <div className="profileCardText">
                <span className="skeletonBlock skeletonLine" />
              </div>
            </div>
          )}
          <button
            type="button"
            className="smallBtn iconOnly"
            onClick={openCredsForm}
            title="계정 변경"
            aria-label="계정 변경"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
      )}
      {formVisible && (
        <section className="panel form">
          <div className="row">
            <div className="field">
              <label>
                Steam ID64
                <span
                  className="helpIcon"
                  tabIndex={0}
                  role="note"
                  aria-label="Steam ID64 도움말"
                  data-tooltip={
                    view === "wishlist"
                      ? "프로필 페이지 URL의 숫자입니다 (steamcommunity.com/profiles/76561198xxxxxxxxx 형태). 커스텀 URL(steamcommunity.com/id/닉네임)이면 steamid.io 같은 사이트에서 변환하세요."
                      : "프로필 페이지 URL의 숫자입니다 (steamcommunity.com/profiles/76561198xxxxxxxxx 형태). 커스텀 URL(steamcommunity.com/id/닉네임)이면 steamid.io 같은 사이트에서 변환하세요. 찜목록 탭과 같은 값을 공유합니다 - 한쪽에서 입력해두면 다른 탭에서도 그대로 쓰입니다. 개인정보 설정에서 '게임 세부정보'가 공개여야 라이브러리를 가져올 수 있습니다."
                  }
                >
                  ?
                </span>
              </label>
              <input
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder="Steam ID64"
                onKeyDown={(e) => e.key === "Enter" && loadActive()}
              />
            </div>
            <label className="sortCheck">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              이 정보 저장
            </label>
            <button type="button" onClick={loadActive} disabled={loading}>
              {loading
                ? "가져오는 중..."
                : view === "wishlist"
                  ? "찜목록 가져오기"
                  : "라이브러리 가져오기"}
            </button>
          </div>
        </section>
      )}
      {showGenreLevels && (
        <div popover="auto" id="genre-level-popover" className="genreLevelPopover">
          <div className="genreLevelHeader">
            <span className="genreLevelTitle">
              장르 프로필
              <span
                className="helpIcon"
                tabIndex={0}
                role="note"
                aria-label="장르 프로필 도움말"
                data-tooltip="Steam 플레이타임을 16개 큰 장르로 나눠 쌓은 레벨이에요. 장르가 맞는 게임이 5개 이상, 합계 10시간 이상이면 나타나요. 레벨 = ⌊√(누적시간 ÷ 5)⌋ (Lv.1=5시간, Lv.2=20시간, Lv.3=45시간... 레벨이 오를수록 다음 레벨까지 더 오래 걸려요). 게임 하나가 여러 장르에 걸치면 시간을 똑같이 나눠요. 직접 추가한 게임은 입력한 플레이타임으로 들어가고, 플레이타임이 0이거나 '제외' 상태인 게임은 빠져요. 장르를 누르면 세부 장르별 시간을 볼 수 있어요."
              >
                ?
              </span>
            </span>
            <button
              type="button"
              className="filterCloseBtn"
              popoverTarget="genre-level-popover"
              popoverTargetAction="hide"
              aria-label="닫기"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="4" y1="4" x2="20" y2="20" />
                <line x1="20" y1="4" x2="4" y2="20" />
              </svg>
            </button>
          </div>
          {/* Only worth a tab row when there's a second tab to switch to. */}
          {genreTaste.length > 0 && (
            <div className="genreTabRow">
              <button
                type="button"
                className={"genreTab " + (genreTab === "level" ? "active" : "")}
                onClick={() => setGenreTab("level")}
              >
                장르 레벨
              </button>
              <button
                type="button"
                className={"genreTab " + (genreTab === "taste" ? "active" : "")}
                onClick={() => setGenreTab("taste")}
              >
                장르 선호도
              </button>
            </div>
          )}
          {genreTab === "level" && (
            <>
              <GenreRadar
                entries={genreLevels
                  .slice(0, 8)
                  .map(({ genreId, genre, hours }) => ({ genreId, genre, value: hours }))}
              />
              <div className="genreChartScroll">
                {(() => {
                  const maxHours = genreLevels[0]?.hours || 1;
                  return genreLevels.map(({ genreId, genre, hours, level }) => {
                    const detail = genreBreakdown[genreId];
                    const hasDetail = !!detail && detail.children.length > 0;
                    const expanded = expandedGenres.has(genreId);
                    return (
                      <div key={genreId} className="chartGroup">
                        <div
                          className={"chartRow" + (hasDetail ? " expandable" : "")}
                          title={`${genre} · Lv.${level} · ${Math.round(hours)}시간`}
                          onClick={hasDetail ? () => toggleExpanded(genreId) : undefined}
                          role={hasDetail ? "button" : undefined}
                          tabIndex={hasDetail ? 0 : undefined}
                          onKeyDown={
                            hasDetail
                              ? (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleExpanded(genreId);
                                  }
                                }
                              : undefined
                          }
                          aria-expanded={hasDetail ? expanded : undefined}
                          aria-controls={hasDetail ? `genre-detail-${genreId}` : undefined}
                        >
                          <span className="chartLabel">
                            <GenreGlyph genreId={genreId} className="genreGlyph" />
                            {genre}
                            {hasDetail && (
                              <span className={"fieldChevron" + (expanded ? " open" : "")} />
                            )}
                          </span>
                          <div className="chartTrack">
                            <i
                              className="chartBar"
                              style={
                                {
                                  "--bar-pct": `${(hours / maxHours) * 100}%`,
                                } as CSSProperties
                              }
                            />
                          </div>
                          <span className="chartValue">Lv.{level}</span>
                        </div>
                        {hasDetail && expanded && (
                          <div className="genreSubPanel" id={`genre-detail-${genreId}`}>
                            <div className="genreSubHeader">
                              <span>세부 장르</span>
                              <span>{genre} 내 시간 비중</span>
                            </div>
                            <ul className="genreSubList" aria-label={`${genre} 세부 장르`}>
                              {detail.children.map((c, index) => {
                                const percent = hours > 0 ? (c.hours / hours) * 100 : 0;
                                return (
                                  <li key={c.id}>
                                    <span className="genreSubRank" aria-hidden="true">
                                      {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <div className="genreSubContent">
                                      <div className="genreSubMeta">
                                        <span className="genreSubName">{c.name}</span>
                                        <span className="genreSubHours">
                                          {c.hours < 1
                                            ? "1시간 미만"
                                            : `${Math.round(c.hours).toLocaleString("ko-KR")}시간`}
                                        </span>
                                        <span className="genreSubPercent">
                                          {percent > 0 && percent < 1 ? "<1" : Math.round(percent)}%
                                        </span>
                                      </div>
                                      <div className="genreSubTrack" aria-hidden="true">
                                        <span
                                          style={{
                                            width: `${Math.min(100, Math.max(0, percent))}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                            {detail.other > 0.5 && (
                              <div className="genreSubOther">
                                <span>그 외</span>
                                <span className="genreSubHours">
                                  {Math.round(detail.other).toLocaleString("ko-KR")}시간
                                </span>
                                <span className="genreSubPercent">
                                  {hours > 0 ? Math.round((detail.other / hours) * 100) : 0}%
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          )}
          {genreTab === "taste" && genreTaste.length > 0 && (
            <>
              <div className="genreTasteHint">실험적 기능 - 위시리스트 추천에 활용 예정</div>
              <div className="genreChartScroll">
                {genreTaste.map(({ genreId, genre, games, affinity }) => {
                  const pct = Math.round((affinity - 1) * 100);
                  const barPct =
                    (Math.min(Math.abs(pct), TASTE_PCT_DOMAIN) / TASTE_PCT_DOMAIN) * 100;
                  return (
                    <div
                      key={genreId}
                      className="divergeRow"
                      title={`${genre} · ${games}개 게임 · ${pct >= 0 ? "+" : ""}${pct}%`}
                    >
                      <span className="chartLabel">
                        <GenreGlyph
                          genreId={GENRE_ICON_PARENT[genreId] ?? genreId}
                          className="genreGlyph"
                        />
                        {genre}
                      </span>
                      <div className="divergeTrack">
                        <div className="divergeHalf bad">
                          {pct < 0 && (
                            <i
                              className="divergeBar bad"
                              style={{ "--bar-pct": `${barPct}%` } as CSSProperties}
                            />
                          )}
                        </div>
                        <div className="divergeCenter" />
                        <div className="divergeHalf good">
                          {pct >= 0 && (
                            <i
                              className="divergeBar good"
                              style={{ "--bar-pct": `${barPct}%` } as CSSProperties}
                            />
                          )}
                        </div>
                      </div>
                      <span className={"chartValue " + (pct >= 0 ? "good" : "bad")}>
                        {pct >= 0 ? "+" : ""}
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
