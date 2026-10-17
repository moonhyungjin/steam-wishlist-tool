// Genre levels (profile badge + level popover): playtime per broad genre, shown as-is.
export const GENRE_LEVELS_ENABLED = true;
// Genre taste and everything built on it (the popover's 장르 선호도 tab, the badge's "선호 1위"
// tooltip, the wishlist's 추천도 높은순 sort and its recommend chip). Held back: on the author's
// account it did not beat the existing review sort - see docs/genre-taste-eval.md for the result
// and how to re-run it before turning this on. Off means the taste profile isn't computed at all.
export const GENRE_TASTE_ENABLED = false;
// Deliberately much smaller than the genre *filter*'s GENRE_ALLOWLIST (100+ raw Steam tags) - that
// list is great for filtering (fine-grained facets are useful there) but terrible for leveling,
// since near-synonyms ("1인칭 슈팅"/"히어로 슈팅"/"익스트랙션 슈터") would each level up as their
// own separate, diluted bucket instead of one meaningful "슈팅" level. This list only has broad,
// non-overlapping top-level genres.
// Matched by Steam tagid, not name text - a display-name rename by Valve would otherwise
// silently break this allowlist without erroring anywhere. IDs resolved from a live snapshot
// of IStoreService/GetTagList (see app/steamTags.ts); names in the comments are just for
// readability when editing this list.
export const GENRE_LEVEL_ALLOWLIST_IDS = new Set([
  19, // 액션
  122, // RPG
  9, // 전략
  599, // 시뮬레이션
  701, // 스포츠
  699, // 레이싱
  1664, // 퍼즐
  1625, // 플랫폼
  1774, // 슈팅
  1667, // 공포
  1743, // 격투
  1752, // 리듬
  1718, // MOBA
  128, // MMO
  1666, // 카드 게임
  3799, // 비주얼 노벨
]);
// Narrower sub-genre tags shown *inside* each broad level above (the popover's expandable
// breakdown) - they never level up on their own, so a game's hours aren't split into extra
// buckets. A child can sit under several parents (액션 RPG is both 액션 and RPG). Picked with
// tools/genre-tag-picker.html's "세부 장르" category.
export const GENRE_LEVEL_CHILDREN: Record<number, number[]> = {
  19: [
    1628, 1646, 29482, 4255, 4158, 4777, 323922, 1687, 42804, 4106, 4231, 4608, 176981, 1723, 3955,
  ],
  122: [4434, 4474, 4231, 17305, 21725, 10695, 1720, 1754, 29482],
  9: [1676, 1741, 1670, 4364, 1645, 1708, 3813, 14139, 4684, 1723, 17305, 21725],
  599: [
    87918, 10235, 9551, 4328, 12472, 35079, 16598, 1100687, 26921, 5900, 220585, 1100688, 1100686,
    1220528, 9204, 91114, 22602, 1643, 7332, 16689, 8945,
  ],
  1774: [
    1663, 3814, 4637, 4885, 4758, 5547, 620519, 1199779, 1023537, 56690, 3954, 353880, 4255, 176981,
  ],
  1664: [1665, 5537, 6129, 1738],
  1625: [5379, 5395, 3877, 5537, 8666, 1628],
  1667: [3978, 1721],
  1743: [4736, 6506, 4777],
  1666: [9271, 32322, 1091588, 791774, 1084988],
  699: [4102],
  128: [1754],
};
// Quadratic RPG-style curve: level N needs N^2 * GENRE_XP_PER_LEVEL_SQ cumulative hours (5h/20h/
// 45h/80h/125h...) - cheap early levels, meaningfully harder later. Tune this one constant to
// retune the whole curve.
export const GENRE_XP_PER_LEVEL_SQ = 5;
// A genre only enters the taste profile once it's shown up in at least this many owned games -
// below that, one 5-star fluke or one dropped game would swing the average wildly on pure noise.
export const TASTE_MIN_GAMES = 12;
// The whole genre-level badge/popover stays hidden until the library has at least this much real
// signal - both floors have to clear, not just one, so neither "one 10-hour game" nor "50 games
// played for 5 minutes each" is enough on its own to call it a "profile."
export const GENRE_LEVELS_MIN_GAMES = 5;
export const GENRE_LEVELS_MIN_HOURS = 10;
// The diverging taste chart's fixed +/-domain, in percentage points off the recentered baseline
// (see genreTaste's comment on personalAvg) - kept as a fixed domain rather than scaled to
// each render's own min/max so the same score always draws the same bar length regardless of
// what else is in the library that day. 60 is sized off real post-recentering data (one real
// account's spread topped out around -48%/+20%, well within it) rather than gameAffinity()'s
// theoretical extremes, which would only be reached by a library with nothing but perfectly
// consistent 5-star-completed or 0.5-star-dropped games in a genre - not a realistic case worth
// sizing the chart around.
export const TASTE_PCT_DOMAIN = 60;
export const GENRE_FILTER_LIMIT = 40;
// Steam's community tags mix real genres/mechanics with aesthetic or subjective descriptors
// (귀여운, 여주인공, 2D, ...) that aren't useful as a filter facet and would otherwise crowd out
// actually-common genres by raw tag frequency. This curates the filter panel down to tags that
// describe genre or gameplay mechanics; the per-game tag line elsewhere is unaffected.
// Matched by tagid (see the GENRE_LEVEL_ALLOWLIST_IDS comment above) - names in comments are
// just for readability.
export const GENRE_ALLOWLIST_IDS = new Set([
  9, // 전략
  19, // 액션
  21, // 어드벤처
  122, // RPG
  128, // MMO
  492, // 인디
  597, // 캐주얼
  599, // 시뮬레이션
  699, // 레이싱
  701, // 스포츠
  1625, // 플랫폼
  1628, // 메트로배니아
  1643, // 건설
  1645, // 타워 디펜스
  1646, // 핵 앤 슬래시
  1662, // 생존
  3978, // 생존 공포
  1663, // 1인칭 슈팅
  3814, // 3인칭 슈팅
  1664, // 퍼즐
  5537, // 퍼즐 플랫폼
  1665, // 매치 3
  1666, // 카드 게임
  9271, // 트레이딩 카드 게임
  1667, // 공포
  1721, // 심리적 공포
  1670, // 4X
  1676, // 실시간 전략
  3813, // 실시간 전술
  1677, // 턴제
  1741, // 턴제 전략
  14139, // 턴제 전술
  1684, // 판타지
  4604, // 다크 판타지
  1685, // 협동
  4508, // 협동 캠페인
  1687, // 잠입
  1695, // 오픈 월드
  1698, // 포인트 앤드 클릭
  1702, // 크래프팅
  1708, // 전술
  1716, // 로그라이크
  3959, // 로그라이트
  454187, // 정통 로그라이크
  1091588, // 로그라이크 덱빌딩
  1718, // MOBA
  1720, // 던전 크롤러
  1723, // 액션 RTS
  1730, // 창고지기
  1743, // 격투
  4736, // 2D 격투
  6506, // 3D 격투
  1752, // 리듬
  1754, // MMORPG
  1770, // 보드게임
  1773, // 아케이드
  1774, // 슈팅
  4637, // 탑다운 슈팅
  1023537, // 부머 슈팅
  3799, // 비주얼 노벨
  3810, // 샌드박스
  3942, // 공상과학
  3993, // 전투
  4106, // 액션 어드벤처
  4115, // 사이버펑크
  4231, // 액션 RPG
  4328, // 도시 건설
  4434, // JRPG
  4474, // CRPG
  4520, // 파밍
  87918, // 농장 시뮬레이션
  4684, // 전쟁 게임
  4695, // 경제
  12472, // 경영
  16689, // 시간 관리
  10235, // 생활 시뮬레이션
  9551, // 연애 시뮬레이션
  5900, // 걷기 시뮬레이션
  35079, // 직업 시뮬레이션
  16598, // 우주 시뮬레이션
  26921, // 정치 시뮬레이션
  22602, // 농업
  32322, // 덱빌딩
  176981, // 배틀 로얄
  29482, // 소울라이크
  31275, // 텍스트 기반
  17305, // 전략 RPG
  21725, // 전술 RPG
  25959, // 무협
  21978, // VR
  7108, // 파티
  7178, // 파티 게임
  5752, // 로봇
  1659, // 좀비
  1674, // 타자
  11104, // 차량 전투
  8122, // 레벨 에디터
  25085, // 터치 친화적
  620519, // 히어로 슈팅
  1199779, // 익스트랙션 슈터
  5547, // 아레나 슈팅
]);
