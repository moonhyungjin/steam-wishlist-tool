"use client";
import { type CSSProperties } from "react";
import {
  type View,
  type Profile,
  type SortKey,
  type PlayStatus,
  type Rating,
  type StarRating,
  type ManualPlatform,
} from "../types";
import {
  STAR_VALUES,
  WISHLIST_SORT_OPTIONS,
  LIBRARY_SORT_OPTIONS,
  STATUS_LABELS,
  STATUS_ORDER,
  RATING_EMOJI,
  RATING_LABELS,
  MANUAL_PLATFORM_LABELS,
} from "../constants";
import { GENRE_LEVELING_ENABLED, TASTE_PCT_DOMAIN } from "../genres";
import { StarRow } from "./Glyphs";
import { GenreGlyph, GENRE_ICON_PARENT, GenreRadar } from "./GenreGlyph";
import { FilterGroup } from "./FilterGroup";
export function Sidebar({
  collapsedGroups,
  discountTierCounts,
  error,
  excludeComingSoon,
  excludeDemo,
  excludeEarlyAccess,
  excludeFree,
  excludeNotLowest,
  formVisible,
  genreCounts,
  genreFilter,
  genreLevels,
  genreTab,
  genreTaste,
  koreanCounts,
  koreanFilter,
  loadActive,
  loading,
  minDiscount,
  mobileFiltersOpen,
  openCredsForm,
  platformCounts,
  platformFilter,
  profile,
  profileError,
  profileLoading,
  ratingCounts,
  ratingFilter,
  rememberMe,
  selectKoreanFilter,
  selectMinDiscount,
  selectSortKey,
  setExcludeComingSoon,
  setExcludeDemo,
  setExcludeEarlyAccess,
  setExcludeFree,
  setExcludeNotLowest,
  setGenreTab,
  setMobileFiltersOpen,
  setRememberMe,
  setSteamId,
  showGenreLevels,
  sortKey,
  starCounts,
  starFilter,
  statusCounts,
  statusFilter,
  steamId,
  switchView,
  toggleGenre,
  toggleGroup,
  togglePlatformFilter,
  toggleRatingFilter,
  toggleStarFilter,
  toggleStatusFilter,
  view,
}: {
  collapsedGroups: Set<string>;
  discountTierCounts: { any: number; p50: number; p75: number };
  error: string;
  excludeComingSoon: boolean;
  excludeDemo: boolean;
  excludeEarlyAccess: boolean;
  excludeFree: boolean;
  excludeNotLowest: boolean;
  formVisible: boolean;
  genreCounts: { id: number; name: string; count: number }[];
  genreFilter: number[];
  genreLevels: { level: number; progress: number; genreId: number; genre: string; hours: number }[];
  genreTab: "level" | "taste";
  genreTaste: { genreId: number; genre: string; games: number; affinity: number }[];
  koreanCounts: { supported: number; unsupported: number };
  koreanFilter: "supported" | "unsupported" | null;
  loadActive: () => Promise<void>;
  loading: boolean;
  minDiscount: number;
  mobileFiltersOpen: boolean;
  openCredsForm: () => void;
  platformCounts: Record<string, number>;
  platformFilter: ManualPlatform[];
  profile: Profile | null;
  profileError: string;
  profileLoading: boolean;
  ratingCounts: Record<string, number>;
  ratingFilter: (Rating | "none")[];
  rememberMe: boolean;
  selectKoreanFilter: (v: "supported" | "unsupported") => void;
  selectMinDiscount: (v: number) => void;
  selectSortKey: (key: SortKey) => void;
  setExcludeComingSoon: React.Dispatch<React.SetStateAction<boolean>>;
  setExcludeDemo: React.Dispatch<React.SetStateAction<boolean>>;
  setExcludeEarlyAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setExcludeFree: React.Dispatch<React.SetStateAction<boolean>>;
  setExcludeNotLowest: React.Dispatch<React.SetStateAction<boolean>>;
  setGenreTab: React.Dispatch<React.SetStateAction<"level" | "taste">>;
  setMobileFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRememberMe: React.Dispatch<React.SetStateAction<boolean>>;
  setSteamId: React.Dispatch<React.SetStateAction<string>>;
  showGenreLevels: false;
  sortKey: SortKey | null;
  starCounts: Record<string, number>;
  starFilter: (StarRating | "none")[];
  statusCounts: Record<string, number>;
  statusFilter: (PlayStatus | "none")[];
  steamId: string;
  switchView: (next: View) => void;
  toggleGenre: (genreId: number) => void;
  toggleGroup: (key: string) => void;
  togglePlatformFilter: (p: "steam" | ManualPlatform) => void;
  toggleRatingFilter: (r: Rating | "none") => void;
  toggleStarFilter: (s: StarRating | "none") => void;
  toggleStatusFilter: (s: PlayStatus | "none") => void;
  view: View;
}) {
  return (
    <aside className="sidebar">
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
                  data-tooltip="라이브러리에 장르가 매칭되는 게임이 5개 이상, 누적 10시간 이상 쌓여야 이 프로필이 나타납니다. 레벨 = ⌊√(누적시간 ÷ 5)⌋ (Lv.1=5시간, Lv.2=20시간, Lv.3=45시간... 뒤로 갈수록 완만해지는 곡선). 21개 굵은 장르 카테고리로 집계되며, 게임 하나가 여러 장르에 걸치면 시간을 균등 분배합니다. 플레이타임 0시간이거나 '제외' 상태인 게임은 집계에서 빠집니다. 장르 선호도(%)는 절대 기준이 아니라 본인의 전체 평균 대비 상대값이며, 최소 12개 이상 보유한 장르만 표시됩니다."
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
            <div className="genreTabRow">
              <button
                type="button"
                className={"genreTab " + (genreTab === "level" ? "active" : "")}
                onClick={() => setGenreTab("level")}
              >
                장르 레벨
              </button>
              {genreTaste.length > 0 && (
                <button
                  type="button"
                  className={"genreTab " + (genreTab === "taste" ? "active" : "")}
                  onClick={() => setGenreTab("taste")}
                >
                  장르 선호도
                </button>
              )}
            </div>
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
                    return genreLevels.map(({ genreId, genre, hours, level }) => (
                      <div
                        key={genreId}
                        className="chartRow"
                        title={`${genre} · Lv.${level} · ${Math.round(hours)}시간`}
                      >
                        <span className="chartLabel">
                          <GenreGlyph genreId={genreId} className="genreGlyph" />
                          {genre}
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
                    ));
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
      <div className="viewTabs">
        <button
          className={"tabBtn " + (view === "wishlist" ? "active" : "")}
          onClick={() => switchView("wishlist")}
        >
          찜목록
        </button>
        <button
          className={"tabBtn " + (view === "library" ? "active" : "")}
          onClick={() => switchView("library")}
        >
          라이브러리
        </button>
      </div>
      {profileError && <section className="error">{profileError}</section>}
      {error && (
        <section className="error">
          {error}
          <button type="button" className="retryBtn" onClick={loadActive} disabled={loading}>
            {loading ? "다시 시도 중..." : "다시 시도"}
          </button>
        </section>
      )}
      <section className={"panel filterPanel" + (mobileFiltersOpen ? " mobileOpen" : "")}>
        <div className="filterPanelHeader">
          <span>필터</span>
          <button
            type="button"
            className="filterCloseBtn"
            onClick={() => setMobileFiltersOpen(false)}
            aria-label="필터 닫기"
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
        {view === "wishlist" && (
          <>
            <FilterGroup
              title="할인"
              collapsed={collapsedGroups.has("discount")}
              onToggle={() => toggleGroup("discount")}
              activeCount={minDiscount > 0 ? 1 : 0}
            >
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={minDiscount === 1}
                  onChange={() => selectMinDiscount(1)}
                />
                할인 중 ({discountTierCounts.any})
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={minDiscount === 50}
                  onChange={() => selectMinDiscount(50)}
                />
                50% 이상 ({discountTierCounts.p50})
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={minDiscount === 75}
                  onChange={() => selectMinDiscount(75)}
                />
                75% 이상 ({discountTierCounts.p75})
              </label>
            </FilterGroup>
            <FilterGroup
              title="정렬"
              collapsed={collapsedGroups.has("sort")}
              onToggle={() => toggleGroup("sort")}
              activeCount={sortKey ? 1 : 0}
            >
              {WISHLIST_SORT_OPTIONS.filter(
                (opt) =>
                  opt.value !== "recommend-desc" ||
                  (GENRE_LEVELING_ENABLED && genreTaste.length > 0),
              ).map((opt) => (
                <label key={opt.value} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={sortKey === opt.value}
                    onChange={() => selectSortKey(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </FilterGroup>
            <FilterGroup
              title="제외"
              collapsed={collapsedGroups.has("wishlistExclude")}
              onToggle={() => toggleGroup("wishlistExclude")}
              activeCount={
                (excludeEarlyAccess ? 1 : 0) +
                (excludeComingSoon ? 1 : 0) +
                (excludeNotLowest ? 1 : 0)
              }
            >
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeEarlyAccess}
                  onChange={() => setExcludeEarlyAccess((v) => !v)}
                />
                앞서 해보기 제외
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeComingSoon}
                  onChange={() => setExcludeComingSoon((v) => !v)}
                />
                출시 예정 제외
              </label>
              <label
                className="sortCheck"
                title="ITAD에 가격 기록이 없는(❔) 게임은 남겨두고, 기록은 있지만 지금이 최저가가 아닌(❌) 게임만 제외합니다"
              >
                <input
                  type="checkbox"
                  checked={excludeNotLowest}
                  onChange={() => setExcludeNotLowest((v) => !v)}
                />
                최저가 아닌 게임 제외
              </label>
            </FilterGroup>
            <FilterGroup
              title="한국어"
              collapsed={collapsedGroups.has("korean")}
              onToggle={() => toggleGroup("korean")}
              activeCount={koreanFilter ? 1 : 0}
            >
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={koreanFilter === "supported"}
                  onChange={() => selectKoreanFilter("supported")}
                />
                한국어 지원 ({koreanCounts.supported})
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={koreanFilter === "unsupported"}
                  onChange={() => selectKoreanFilter("unsupported")}
                />
                한국어 미지원 ({koreanCounts.unsupported})
              </label>
            </FilterGroup>
          </>
        )}
        {view === "library" && (
          <>
            <FilterGroup
              title="정렬"
              collapsed={collapsedGroups.has("sort")}
              onToggle={() => toggleGroup("sort")}
              activeCount={sortKey ? 1 : 0}
            >
              {LIBRARY_SORT_OPTIONS.map((opt) => (
                <label key={opt.value} className="sortCheck">
                  <input
                    type="checkbox"
                    checked={sortKey === opt.value}
                    onChange={() => selectSortKey(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </FilterGroup>
            <FilterGroup
              title="제외"
              collapsed={collapsedGroups.has("libraryFilter")}
              onToggle={() => toggleGroup("libraryFilter")}
              activeCount={(excludeDemo ? 1 : 0) + (excludeFree ? 1 : 0)}
            >
              {/* <label className="sortCheck">
              <input
                type="checkbox"
                checked={excludeAdult}
                onChange={() => setExcludeAdult((v) => !v)}
              />
              선정적 콘텐츠 제외
            </label> */}
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeDemo}
                  onChange={() => setExcludeDemo((v) => !v)}
                />
                데모 제외
              </label>
              <label className="sortCheck">
                <input
                  type="checkbox"
                  checked={excludeFree}
                  onChange={() => setExcludeFree((v) => !v)}
                />
                무료 게임 제외
              </label>
            </FilterGroup>
          </>
        )}
        {view === "library" && (
          <FilterGroup
            title="플랫폼"
            collapsed={collapsedGroups.has("platform")}
            onToggle={() => toggleGroup("platform")}
            activeCount={platformFilter.length}
          >
            <label className="sortCheck">
              <input
                type="checkbox"
                checked={platformFilter.includes("steam")}
                onChange={() => togglePlatformFilter("steam")}
              />
              Steam ({platformCounts.steam})
            </label>
            {(["epic", "stove", "other"] as const).map((p) => (
              <label key={p} className="sortCheck">
                <input
                  type="checkbox"
                  checked={platformFilter.includes(p)}
                  onChange={() => togglePlatformFilter(p)}
                />
                {MANUAL_PLATFORM_LABELS[p]} ({platformCounts[p]})
              </label>
            ))}
          </FilterGroup>
        )}
        {view === "library" && (
          <FilterGroup
            title="진행 상태"
            collapsed={collapsedGroups.has("status")}
            onToggle={() => toggleGroup("status")}
            activeCount={statusFilter.length}
          >
            {STATUS_ORDER.map((s) => (
              <label key={s} className="sortCheck">
                <input
                  type="checkbox"
                  checked={statusFilter.includes(s)}
                  onChange={() => toggleStatusFilter(s)}
                />
                {STATUS_LABELS[s]} ({statusCounts[s]})
              </label>
            ))}
            <label className="sortCheck">
              <input
                type="checkbox"
                checked={statusFilter.includes("none")}
                onChange={() => toggleStatusFilter("none")}
              />
              미분류 ({statusCounts.none})
            </label>
          </FilterGroup>
        )}
        {view === "library" && (
          <FilterGroup
            title="별점"
            collapsed={collapsedGroups.has("star")}
            onToggle={() => toggleGroup("star")}
            activeCount={starFilter.length}
          >
            {[...STAR_VALUES].reverse().map((v) => (
              <label key={v} className="sortCheck">
                <input
                  type="checkbox"
                  checked={starFilter.includes(v)}
                  onChange={() => toggleStarFilter(v)}
                />
                <StarRow value={v} /> ({starCounts[v] ?? 0})
              </label>
            ))}
            <label className="sortCheck">
              <input
                type="checkbox"
                checked={starFilter.includes("none")}
                onChange={() => toggleStarFilter("none")}
              />
              미평가 ({starCounts.none})
            </label>
          </FilterGroup>
        )}
        {view === "library" && (
          <FilterGroup
            title="추천"
            collapsed={collapsedGroups.has("rating")}
            onToggle={() => toggleGroup("rating")}
            activeCount={ratingFilter.length}
          >
            {(["like", "dislike"] as const).map((r) => (
              <label key={r} className="sortCheck">
                <input
                  type="checkbox"
                  checked={ratingFilter.includes(r)}
                  onChange={() => toggleRatingFilter(r)}
                />
                {RATING_EMOJI[r]} {RATING_LABELS[r]} ({ratingCounts[r]})
              </label>
            ))}
            <label className="sortCheck">
              <input
                type="checkbox"
                checked={ratingFilter.includes("none")}
                onChange={() => toggleRatingFilter("none")}
              />
              미평가 ({ratingCounts.none})
            </label>
          </FilterGroup>
        )}
        {genreCounts.length > 0 && (
          <FilterGroup
            title="장르"
            collapsed={collapsedGroups.has("genre")}
            onToggle={() => toggleGroup("genre")}
            activeCount={genreFilter.length}
          >
            {genreCounts.map(({ id, name, count }) => (
              <label key={id} className="sortCheck">
                <input
                  type="checkbox"
                  checked={genreFilter.includes(id)}
                  onChange={() => toggleGenre(id)}
                />
                {name} ({count})
              </label>
            ))}
          </FilterGroup>
        )}
      </section>
    </aside>
  );
}
