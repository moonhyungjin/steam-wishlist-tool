"use client";
import type { FilterState } from "../useFilterState";
import { type View, type Profile } from "../types";
import { AccountHeader } from "./AccountHeader";
import { FilterPanel } from "./FilterPanel";
export function Sidebar({
  filters,
  discountTierCounts,
  error,
  formVisible,
  genreCounts,
  genreLevels,
  genreTab,
  genreTaste,
  koreanCounts,
  loadActive,
  loading,
  openCredsForm,
  platformCounts,
  profile,
  profileError,
  profileLoading,
  ratingCounts,
  rememberMe,
  setGenreTab,
  setRememberMe,
  setSteamId,
  showGenreLevels,
  starCounts,
  statusCounts,
  steamId,
  switchView,
  view,
}: {
  filters: FilterState;
  discountTierCounts: { any: number; p50: number; p75: number };
  error: string;
  formVisible: boolean;
  genreCounts: { id: number; name: string; count: number }[];
  genreLevels: { level: number; progress: number; genreId: number; genre: string; hours: number }[];
  genreTab: "level" | "taste";
  genreTaste: { genreId: number; genre: string; games: number; affinity: number }[];
  koreanCounts: { supported: number; unsupported: number };
  loadActive: () => Promise<void>;
  loading: boolean;
  openCredsForm: () => void;
  platformCounts: Record<string, number>;
  profile: Profile | null;
  profileError: string;
  profileLoading: boolean;
  ratingCounts: Record<string, number>;
  rememberMe: boolean;
  setGenreTab: React.Dispatch<React.SetStateAction<"level" | "taste">>;
  setRememberMe: React.Dispatch<React.SetStateAction<boolean>>;
  setSteamId: React.Dispatch<React.SetStateAction<string>>;
  showGenreLevels: boolean;
  starCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  steamId: string;
  switchView: (next: View) => void;
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
        filters={filters}
        discountTierCounts={discountTierCounts}
        genreCounts={genreCounts}
        genreTaste={genreTaste}
        koreanCounts={koreanCounts}
        platformCounts={platformCounts}
        ratingCounts={ratingCounts}
        starCounts={starCounts}
        statusCounts={statusCounts}
        view={view}
      />
    </aside>
  );
}
