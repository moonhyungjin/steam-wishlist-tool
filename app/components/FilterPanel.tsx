"use client";
import type { FilterState } from "../useFilterState";
import { STAR_VALUES } from "../constants";
import { type View } from "../types";
import {
  WISHLIST_SORT_OPTIONS,
  LIBRARY_SORT_OPTIONS,
  STATUS_LABELS,
  STATUS_ORDER,
  RATING_EMOJI,
  RATING_LABELS,
  MANUAL_PLATFORM_LABELS,
} from "../constants";
import { GENRE_TASTE_ENABLED } from "../genres";
import { StarRow } from "./Glyphs";
import { FilterGroup } from "./FilterGroup";
export function FilterPanel({
  filters,
  discountTierCounts,
  genreCounts,
  genreTaste,
  koreanCounts,
  platformCounts,
  ratingCounts,
  starCounts,
  statusCounts,
  view,
}: {
  filters: FilterState;
  discountTierCounts: { any: number; p50: number; p75: number };
  genreCounts: { id: number; name: string; count: number }[];
  genreTaste: { genreId: number; genre: string; games: number; affinity: number }[];
  koreanCounts: { supported: number; unsupported: number };
  platformCounts: Record<string, number>;
  ratingCounts: Record<string, number>;
  starCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  view: View;
}) {
  const {
    collapsedGroups,
    excludeComingSoon,
    excludeDemo,
    excludeEarlyAccess,
    excludeFree,
    excludeNotLowest,
    genreFilter,
    koreanFilter,
    minDiscount,
    mobileFiltersOpen,
    platformFilter,
    ratingFilter,
    selectKoreanFilter,
    selectMinDiscount,
    selectSortKey,
    setExcludeComingSoon,
    setExcludeDemo,
    setExcludeEarlyAccess,
    setExcludeFree,
    setExcludeNotLowest,
    setMobileFiltersOpen,
    sortKey,
    starFilter,
    statusFilter,
    toggleGenre,
    toggleGroup,
    togglePlatformFilter,
    toggleRatingFilter,
    toggleStarFilter,
    toggleStatusFilter,
  } = filters;
  return (
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
                opt.value !== "recommend-desc" || (GENRE_TASTE_ENABLED && genreTaste.length > 0),
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
  );
}
