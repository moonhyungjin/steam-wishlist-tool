"use client";
// One glyph per GENRE_LEVEL_ALLOWLIST_IDS entry (same "switch on the enum value" shape as
// StatusGlyph above) - sized via CSS class rather than a size prop, same reasoning as StarGlyph:
// this renders at a different size in the profile badge vs. a chart row, and a shared base class
// plus a per-context size class is less plumbing than threading a size prop through both call
// sites. Every call site is already scoped to the 21-entry allowlist, so an unmatched id
// shouldn't occur in practice; returns null rather than inventing a generic fallback shape.
export function GenreGlyph({ genreId, className }: { genreId: number; className?: string }) {
  switch (genreId) {
    case 19: // 액션
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="13,2 4,14 11,14 9,22 20,9 12,9" />
        </svg>
      );
    case 21: // 어드벤처
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <polygon points="15,9 13,13 9,15 11,11" />
        </svg>
      );
    case 122: // RPG
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z" />
        </svg>
      );
    case 9: // 전략
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
        </svg>
      );
    case 599: // 시뮬레이션
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
      );
    case 701: // 스포츠
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18M5.5 5.5c3 3 3 10 0 13M18.5 5.5c-3 3-3 10 0 13" />
        </svg>
      );
    case 699: // 레이싱
      return (
        <svg className={className} viewBox="0 0 24 24">
          <line
            x1="5"
            y1="3"
            x2="5"
            y2="21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M5 4l7 3-7 3z" fill="currentColor" />
        </svg>
      );
    case 597: // 캐주얼
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
          <path d="M8 15c1.5 1.5 6.5 1.5 8 0" />
        </svg>
      );
    case 492: // 인디
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12,2 15,12 12,22 9,12" />
        </svg>
      );
    case 1664: // 퍼즐
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M4 4h6a2 2 0 1 1 4 0h6v6a2 2 0 1 1 0 4v6h-6a2 2 0 1 1-4 0H4v-6a2 2 0 1 0 0-4z" />
        </svg>
      );
    case 1625: // 플랫폼
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="6" cy="4" r="1.6" fill="currentColor" stroke="none" />
          <line x1="4" y1="8" x2="10" y2="8" />
          <line x1="14" y1="14" x2="20" y2="14" />
          <line x1="6" y1="20" x2="12" y2="20" />
        </svg>
      );
    case 1774: // 슈팅
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      );
    case 1667: // 공포
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a7 7 0 0 0-7 7v9l2-2 2 2 2-2 2 2 2-2 2 2 2-2V10a7 7 0 0 0-7-7z" />
          <circle cx="9.5" cy="10" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="10" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 1662: // 생존
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21c-4 0-6-3-6-6 0-3 2-5 3-8 0 2 1 3 2 3 0-3 1-5 3-7 1 3 3 5 3 9 0 4-1 9-5 9z" />
        </svg>
      );
    case 1716: // 로그라이크
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 1743: // 격투
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 11V7a2 2 0 1 1 4 0M12 11V6a2 2 0 1 1 4 0M16 11V7a2 2 0 1 1 4 0v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-2a2 2 0 1 1 4 0" />
        </svg>
      );
    case 128: // MMO
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="6" cy="7" r="2.2" />
          <circle cx="18" cy="7" r="2.2" />
          <circle cx="12" cy="17" r="2.2" />
          <line x1="7.8" y1="8.5" x2="10.5" y2="15" />
          <line x1="16.2" y1="8.5" x2="13.5" y2="15" />
          <line x1="8.2" y1="7" x2="15.8" y2="7" />
        </svg>
      );
    case 3810: // 샌드박스
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M4 7.5L12 12l8-4.5M12 12v9" />
        </svg>
      );
    case 3799: // 비주얼 노벨
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M4 5c3-1.5 6-1.5 8 0v14c-2-1.5-5-1.5-8 0z" />
          <path d="M20 5c-3-1.5-6-1.5-8 0v14c2-1.5 5-1.5 8 0z" />
        </svg>
      );
    case 1752: // 리듬
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="18" r="2.2" fill="currentColor" stroke="none" />
          <circle cx="17" cy="16" r="2.2" fill="currentColor" stroke="none" />
          <path d="M9.2 18V5l9.8-2v11" />
        </svg>
      );
    case 1718: // MOBA
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="20" x2="17" y2="7" />
          <line x1="20" y1="20" x2="7" y2="7" />
          <polyline points="14,4 17,4 17,7" />
          <polyline points="10,4 7,4 7,7" />
        </svg>
      );
    default:
      return null;
  }
}
// The taste tab's fine-grained genres (GENRE_ALLOWLIST_IDS, up to 101) don't each get their own
// icon - most are near-duplicates of a GENRE_LEVEL_ALLOWLIST_IDS entry (턴제 전략/실시간 전략/4X
// all read as "전략") and hand-drawing 80 more one-off glyphs isn't worth it for a decorative
// touch. This maps every non-self id to whichever of the 21 broad genres is the closest
// conceptual parent, so GenreGlyph(GENRE_ICON_PARENT[id] ?? id) resolves for the whole fine-grained
// set - a judgment call, not a taxonomy, so a few of these are debatable either way.
export const GENRE_ICON_PARENT: Record<number, number> = {
  1628: 1625, // 메트로배니아 -> 플랫폼
  1643: 599, // 건설 -> 시뮬레이션
  1645: 9, // 타워 디펜스 -> 전략
  1646: 19, // 핵 앤 슬래시 -> 액션
  3978: 1667, // 생존 공포 -> 공포
  1663: 1774, // 1인칭 슈팅 -> 슈팅
  3814: 1774, // 3인칭 슈팅 -> 슈팅
  5537: 1664, // 퍼즐 플랫폼 -> 퍼즐
  1665: 1664, // 매치 3 -> 퍼즐
  1666: 9, // 카드 게임 -> 전략
  9271: 9, // 트레이딩 카드 게임 -> 전략
  1721: 1667, // 심리적 공포 -> 공포
  1670: 9, // 4X -> 전략
  1676: 9, // 실시간 전략 -> 전략
  3813: 9, // 실시간 전술 -> 전략
  1677: 9, // 턴제 -> 전략
  1741: 9, // 턴제 전략 -> 전략
  14139: 9, // 턴제 전술 -> 전략
  1684: 122, // 판타지 -> RPG
  4604: 122, // 다크 판타지 -> RPG
  1685: 19, // 협동 -> 액션
  4508: 19, // 협동 캠페인 -> 액션
  1687: 19, // 잠입 -> 액션
  1695: 21, // 오픈 월드 -> 어드벤처
  1698: 21, // 포인트 앤드 클릭 -> 어드벤처
  1702: 599, // 크래프팅 -> 시뮬레이션
  1708: 9, // 전술 -> 전략
  3959: 1716, // 로그라이트 -> 로그라이크
  454187: 1716, // 정통 로그라이크 -> 로그라이크
  1091588: 1716, // 로그라이크 덱빌딩 -> 로그라이크
  1720: 122, // 던전 크롤러 -> RPG
  1723: 19, // 액션 RTS -> 액션
  1730: 1664, // 창고지기 -> 퍼즐
  4736: 1743, // 2D 격투 -> 격투
  6506: 1743, // 3D 격투 -> 격투
  1754: 128, // MMORPG -> MMO
  1770: 9, // 보드게임 -> 전략
  1773: 19, // 아케이드 -> 액션
  4637: 1774, // 탑다운 슈팅 -> 슈팅
  1023537: 1774, // 부머 슈팅 -> 슈팅
  3942: 21, // 공상과학 -> 어드벤처
  3993: 19, // 전투 -> 액션
  4106: 19, // 액션 어드벤처 -> 액션
  4115: 21, // 사이버펑크 -> 어드벤처
  4231: 122, // 액션 RPG -> RPG
  4328: 599, // 도시 건설 -> 시뮬레이션
  4434: 122, // JRPG -> RPG
  4474: 122, // CRPG -> RPG
  4520: 599, // 파밍 -> 시뮬레이션
  87918: 599, // 농장 시뮬레이션 -> 시뮬레이션
  4684: 9, // 전쟁 게임 -> 전략
  4695: 599, // 경제 -> 시뮬레이션
  12472: 599, // 경영 -> 시뮬레이션
  16689: 599, // 시간 관리 -> 시뮬레이션
  10235: 599, // 생활 시뮬레이션 -> 시뮬레이션
  9551: 599, // 연애 시뮬레이션 -> 시뮬레이션
  5900: 21, // 걷기 시뮬레이션 -> 어드벤처
  35079: 599, // 직업 시뮬레이션 -> 시뮬레이션
  16598: 599, // 우주 시뮬레이션 -> 시뮬레이션
  26921: 599, // 정치 시뮬레이션 -> 시뮬레이션
  22602: 599, // 농업 -> 시뮬레이션
  32322: 9, // 덱빌딩 -> 전략
  176981: 19, // 배틀 로얄 -> 액션
  29482: 122, // 소울라이크 -> RPG
  31275: 21, // 텍스트 기반 -> 어드벤처
  17305: 9, // 전략 RPG -> 전략
  21725: 9, // 전술 RPG -> 전략
  25959: 1743, // 무협 -> 격투
  21978: 19, // VR -> 액션
  7108: 597, // 파티 -> 캐주얼
  7178: 597, // 파티 게임 -> 캐주얼
  5752: 19, // 로봇 -> 액션
  1659: 1667, // 좀비 -> 공포
  1674: 1664, // 타자 -> 퍼즐
  11104: 699, // 차량 전투 -> 레이싱
  8122: 599, // 레벨 에디터 -> 시뮬레이션
  25085: 597, // 터치 친화적 -> 캐주얼
  620519: 1774, // 히어로 슈팅 -> 슈팅
  1199779: 1774, // 익스트랙션 슈터 -> 슈팅
  5547: 1774, // 아레나 슈팅 -> 슈팅
};
// Compact spider/radar chart - up to N genres as axes (angle = index, radius = value / the
// largest value shown), so it reads as "shape of my play" rather than absolute magnitude (the
// bar list below it already covers that). Points/rings/spokes are computed with plain trig
// rather than baked into fixed paths, since the axis count and each value varies per library.
export function GenreRadar({
  entries,
}: {
  entries: { genreId: number; genre: string; value: number }[];
}) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const r = 84;
  const n = entries.length;
  if (n < 3) return null;
  const maxValue = Math.max(...entries.map((e) => e.value), 1);
  const angleFor = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pointAt = (i: number, frac: number) => {
    const a = angleFor(i);
    return { x: cx + r * frac * Math.cos(a), y: cy + r * frac * Math.sin(a) };
  };
  const dataPath = entries
    .map((e, i) => {
      const p = pointAt(i, e.value / maxValue);
      return `${p.x},${p.y}`;
    })
    .join(" ");
  return (
    <svg className="genreRadar" viewBox={`0 0 ${size} ${size}`}>
      {[0.33, 0.66, 1].map((ring) => (
        <polygon
          key={ring}
          className="radarRing"
          points={entries
            .map((_, i) => {
              const p = pointAt(i, ring);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
        />
      ))}
      {entries.map((e, i) => {
        const p = pointAt(i, 1);
        return <line key={e.genreId} className="radarSpoke" x1={cx} y1={cy} x2={p.x} y2={p.y} />;
      })}
      <polygon className="radarShape" points={dataPath} />
      {entries.map((e, i) => {
        const p = pointAt(i, 1.2);
        const cosA = Math.cos(angleFor(i));
        const anchor = cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";
        return (
          <text
            key={e.genreId}
            className="radarLabel"
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {e.genre}
          </text>
        );
      })}
    </svg>
  );
}
