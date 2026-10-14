"use client";
import { useLayoutEffect, useState } from "react";
import type { ManualPlatform, PlayStatus, Rating, SortKey, StarRating } from "./types";

// Every piece of "what the user has narrowed/sorted the list by" UI state, plus its toggles - kept
// out of Wishlist so the component only has to combine it with the data (games, maps, counts).
export function useFilterState() {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  function selectSortKey(key: SortKey) {
    setSortKey((prev) => (prev === key ? null : key));
  }
  const [nameQuery, setNameQuery] = useState("");
  // 0 = no filter; otherwise the minimum discount percent to show (any/25/50/75), same tiers
  // Steam's own store sidebar uses.
  const [minDiscount, setMinDiscount] = useState(0);
  function selectMinDiscount(v: number) {
    setMinDiscount((prev) => (prev === v ? 0 : v));
  }
  const [excludeEarlyAccess, setExcludeEarlyAccess] = useState(false);
  const [excludeComingSoon, setExcludeComingSoon] = useState(false);
  // Only excludes the "확인했는데 최저가 아님" state (❌, a real lowestPrice object with atLow
  // false) - games ITAD has no data for (❔, "애매한" - ambiguous, not a confirmed negative) and
  // games not even checked yet are deliberately left alone, per an explicit request to keep those
  // visible rather than filtering out anything that isn't a confirmed "yes, this is the low".
  const [excludeNotLowest, setExcludeNotLowest] = useState(false);
  const [koreanFilter, setKoreanFilter] = useState<"supported" | "unsupported" | null>(null);
  function selectKoreanFilter(v: "supported" | "unsupported") {
    setKoreanFilter((prev) => (prev === v ? null : v));
  }
  const [excludeAdult, setExcludeAdult] = useState(false);
  const [excludeDemo, setExcludeDemo] = useState(false);
  const [excludeFree, setExcludeFree] = useState(false);
  // Only 할인/정렬/제외/장르 start open - the rest (한국어/플랫폼/진행 상태/별점/추천) default collapsed
  // so the sidebar doesn't open on a wall of expanded checkbox lists.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(["korean", "platform", "status", "star", "rating"]),
  );
  // Mirrors the 900px CSS breakpoint so JS-driven layout decisions (row height, the filter
  // drawer) stay in sync with it, including live orientation/resize changes.
  const [isMobile, setIsMobile] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // On mobile the sidebar stacks above the game list instead of sitting beside it, so every
  // filter group expanded by default (especially the ~40-entry genre list) buries the list under
  // a wall of checkboxes - collapse those on first mount there. 할인/정렬/제외 stay open though,
  // same baseline as desktop (see the collapsedGroups comment above) - they're short lists and the
  // whole point of opening the drawer is usually one of those three.
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mq.matches);
    if (mq.matches) {
      setCollapsedGroups(new Set(["korean", "status", "star", "rating", "platform", "genre"]));
    }
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);
  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const [genreFilter, setGenreFilter] = useState<number[]>([]);
  function toggleGenre(genreId: number) {
    setGenreFilter((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId],
    );
  }
  const [statusFilter, setStatusFilter] = useState<(PlayStatus | "none")[]>([]);
  function toggleStatusFilter(s: PlayStatus | "none") {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  // Kept as an array (rather than a single value) to stay compatible with prioritizeAchievementOrder's
  // generic filters.ratingFilter shape below - toggleRatingFilter just never lets it hold more than
  // one entry, since "추천" and "비추천" are mutually exclusive states on any one game, not
  // independently combinable checkboxes like status/star/platform are.
  const [ratingFilter, setRatingFilter] = useState<(Rating | "none")[]>([]);
  function toggleRatingFilter(r: Rating | "none") {
    setRatingFilter((prev) => (prev.includes(r) ? [] : [r]));
  }
  const [starFilter, setStarFilter] = useState<(StarRating | "none")[]>([]);
  function toggleStarFilter(s: StarRating | "none") {
    setStarFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  const [platformFilter, setPlatformFilter] = useState<("steam" | ManualPlatform)[]>([]);
  function togglePlatformFilter(p: "steam" | ManualPlatform) {
    setPlatformFilter((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  return {
    sortKey,
    setSortKey,
    nameQuery,
    setNameQuery,
    minDiscount,
    setMinDiscount,
    excludeEarlyAccess,
    setExcludeEarlyAccess,
    excludeComingSoon,
    setExcludeComingSoon,
    excludeNotLowest,
    setExcludeNotLowest,
    koreanFilter,
    setKoreanFilter,
    excludeAdult,
    setExcludeAdult,
    excludeDemo,
    setExcludeDemo,
    excludeFree,
    setExcludeFree,
    collapsedGroups,
    setCollapsedGroups,
    isMobile,
    setIsMobile,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    genreFilter,
    setGenreFilter,
    statusFilter,
    setStatusFilter,
    ratingFilter,
    setRatingFilter,
    starFilter,
    setStarFilter,
    platformFilter,
    setPlatformFilter,
    selectSortKey,
    selectMinDiscount,
    selectKoreanFilter,
    toggleGroup,
    toggleGenre,
    toggleStatusFilter,
    toggleRatingFilter,
    toggleStarFilter,
    togglePlatformFilter,
  };
}
export type FilterState = ReturnType<typeof useFilterState>;
