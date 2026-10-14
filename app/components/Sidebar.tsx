"use client";
import {
  type View,
  type Profile,
  type SortKey,
  type PlayStatus,
  type Rating,
  type StarRating,
  type ManualPlatform,
} from "../types";
import { AccountHeader } from "./AccountHeader";
import { FilterPanel } from "./FilterPanel";
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
      <AccountHeader
        formVisible={formVisible}
        genreLevels={genreLevels}
        genreTab={genreTab}
        genreTaste={genreTaste}
        loadActive={loadActive}
        loading={loading}
        openCredsForm={openCredsForm}
        profile={profile}
        profileLoading={profileLoading}
        rememberMe={rememberMe}
        setGenreTab={setGenreTab}
        setRememberMe={setRememberMe}
        setSteamId={setSteamId}
        showGenreLevels={showGenreLevels}
        steamId={steamId}
        view={view}
      />
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
      <FilterPanel
        collapsedGroups={collapsedGroups}
        discountTierCounts={discountTierCounts}
        excludeComingSoon={excludeComingSoon}
        excludeDemo={excludeDemo}
        excludeEarlyAccess={excludeEarlyAccess}
        excludeFree={excludeFree}
        excludeNotLowest={excludeNotLowest}
        genreCounts={genreCounts}
        genreFilter={genreFilter}
        genreTaste={genreTaste}
        koreanCounts={koreanCounts}
        koreanFilter={koreanFilter}
        minDiscount={minDiscount}
        mobileFiltersOpen={mobileFiltersOpen}
        platformCounts={platformCounts}
        platformFilter={platformFilter}
        ratingCounts={ratingCounts}
        ratingFilter={ratingFilter}
        selectKoreanFilter={selectKoreanFilter}
        selectMinDiscount={selectMinDiscount}
        selectSortKey={selectSortKey}
        setExcludeComingSoon={setExcludeComingSoon}
        setExcludeDemo={setExcludeDemo}
        setExcludeEarlyAccess={setExcludeEarlyAccess}
        setExcludeFree={setExcludeFree}
        setExcludeNotLowest={setExcludeNotLowest}
        setMobileFiltersOpen={setMobileFiltersOpen}
        sortKey={sortKey}
        starCounts={starCounts}
        starFilter={starFilter}
        statusCounts={statusCounts}
        statusFilter={statusFilter}
        toggleGenre={toggleGenre}
        toggleGroup={toggleGroup}
        togglePlatformFilter={togglePlatformFilter}
        toggleRatingFilter={toggleRatingFilter}
        toggleStarFilter={toggleStarFilter}
        toggleStatusFilter={toggleStatusFilter}
        view={view}
      />
    </aside>
  );
}
