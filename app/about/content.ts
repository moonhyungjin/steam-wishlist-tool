export const GITHUB_URL = "https://github.com/moonhyungjin/steam-wishlist-tool";

export type AboutContent = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  headlineLines: [string, string];
  description: string;
  ctaPrimary: string;
  ctaSecondary: string;
  switchLabel: string;
  switchHref: string;
  problemTitle: string;
  problemDescription: string;
  problemCards: { emoji: string; title: string; text: string }[];
  featuresTitle: string;
  features: { emoji: string; title: string; text: string }[];
  stepsTitle: string;
  steps: { title: string; text: string }[];
  howNote: string;
  previewTitle: string;
  previewDiscountAlt: string;
  previewDiscountCaption: string;
  previewLibraryAlt: string;
  previewLibraryCaption: string;
  heroAlt: string;
  finalCtaTitle: string;
  finalCtaDescription: string;
  footerBrand: string;
  footerGithub: string;
  footerOpenTool: string;
  footerDisclaimer: string;
};

export const EN: AboutContent = {
  metaTitle: "Steam Wishlist Tool — Smarter Game Buying",
  metaDescription:
    "Explore your Steam wishlist, compare available game information, and make more informed game-buying decisions.",
  eyebrow: "PERSONAL STEAM WISHLIST TOOL",
  headlineLines: ["Your Wishlist.", "Smarter Game Buying."],
  description:
    "A simple way to explore your Steam wishlist, compare game details, and make more informed buying decisions.",
  ctaPrimary: "Explore My Wishlist",
  ctaSecondary: "View on GitHub",
  switchLabel: "한국어",
  switchHref: "/about/ko",
  problemTitle: "Your wishlist is a starting point, not a buying decision.",
  problemDescription:
    "A growing wishlist makes it harder to compare games, spot worthwhile discounts, and decide what to play next.",
  problemCards: [
    { emoji: "🗂️", title: "Too Many Games", text: "Keep your growing wishlist easier to explore." },
    { emoji: "🔍", title: "Better Comparisons", text: "Review available game details in one place." },
    {
      emoji: "💡",
      title: "Smarter Decisions",
      text: "Use price, discount, and other available information to help decide what to buy.",
    },
  ],
  featuresTitle: "What it does best.",
  features: [
    {
      emoji: "🏷️",
      title: "Lowest-Price & Sale-End Tracking",
      text: "See whether a discounted game is at its lowest price ever on Steam, and exactly when the sale ends - checked against any of 12 store regions, in that region's own currency.",
    },
    {
      emoji: "🌐",
      title: "Korean-Language Filter",
      text: "Spot games with no Korean support at a glance, and filter them in or out. Support is read from Steam's own language data, not guessed.",
    },
    {
      emoji: "🔎",
      title: "Filter & Sort What Matters",
      text: "Narrow by discount tier (50%+ / 75%+), genre, or Korean support; hide early-access, unreleased, and not-at-lowest games. Sort by price, discount, review score, Metacritic, or sale ending soonest.",
    },
    {
      emoji: "🏆",
      title: "Track Your Library",
      text: "Mark games as playing, completed, on hold, or dropped, give them a 5-star rating and a thumbs up or down, and see achievement progress per game.",
    },
    {
      emoji: "🗳️",
      title: "Vote Sharing",
      text: "Pick a few games from your wishlist or library and share a link - friends vote on which to buy or play next, no login needed. Find your polls and their results again anytime.",
    },
  ],
  stepsTitle: "Get started in three simple steps.",
  steps: [
    { title: "Find Your Steam ID64", text: "Locate the Steam ID64 associated with your profile." },
    { title: "Load Your Wishlist", text: "Enter the ID64 and retrieve your wishlist." },
    {
      title: "Explore and Compare",
      text: "Search, filter, sort, and review the available game information.",
    },
  ],
  howNote:
    "If a wishlist can't be loaded, the Steam profile may be set to private - Steam doesn't distinguish a private profile from an empty one in its public data.",
  previewTitle: "A clearer view of your next purchase.",
  heroAlt:
    "Steam Wishlist Tool showing a real wishlist with discount, lowest-price, Metacritic, and review badges on each game",
  previewDiscountAlt:
    "Wishlist filtered to discounted games, showing lowest-price and discount-end-date badges on each one",
  previewDiscountCaption: "Filter to discounted games and see the lowest price ever and when the sale ends.",
  previewLibraryAlt: "Library view showing 5-star ratings and thumbs-up recommendations on owned games",
  previewLibraryCaption: "Rate and recommend games in your library.",
  finalCtaTitle: "Ready to revisit your wishlist?",
  finalCtaDescription: "Take a fresh look at the games you've been saving.",
  footerBrand: "Steam Wishlist Tool",
  footerGithub: "GitHub repository",
  footerOpenTool: "Open the Tool",
  footerDisclaimer:
    "A small personal tool for browsing a Steam wishlist and comparing game details. This is an independent fan-made project and is not affiliated with or endorsed by Valve or Steam, or by IsThereAnyDeal. Steam-related names and marks are used only for descriptive purposes.",
};

export const KO: AboutContent = {
  metaTitle: "Steam Wishlist Tool — 더 똑똑한 게임 구매",
  metaDescription: "스팀 위시리스트를 둘러보고, 게임 정보를 비교해서 더 현명하게 구매를 결정하세요.",
  eyebrow: "개인용 스팀 위시리스트 도구",
  headlineLines: ["내 위시리스트,", "더 똑똑한 구매 결정."],
  description: "스팀 위시리스트를 한눈에 둘러보고, 게임 정보를 비교해서 더 현명하게 구매를 결정하세요.",
  ctaPrimary: "내 위시리스트 보기",
  ctaSecondary: "GitHub에서 보기",
  switchLabel: "English",
  switchHref: "/about",
  problemTitle: "위시리스트는 시작일 뿐, 구매 결정은 아니에요.",
  problemDescription:
    "위시리스트가 늘어날수록 게임을 비교하고, 괜찮은 할인을 찾고, 다음에 뭘 할지 정하기가 더 어려워져요.",
  problemCards: [
    { emoji: "🗂️", title: "너무 많은 게임", text: "점점 늘어나는 위시리스트를 더 쉽게 둘러보세요." },
    { emoji: "🔍", title: "더 나은 비교", text: "게임 정보를 한곳에서 확인하세요." },
    { emoji: "💡", title: "더 똑똑한 결정", text: "가격, 할인 등 제공되는 정보로 구매 결정을 도와드려요." },
  ],
  featuresTitle: "잘하는 것들.",
  features: [
    {
      emoji: "🏷️",
      title: "최저가 & 세일 종료 추적",
      text: "할인 중인 게임이 스팀 역대 최저가인지, 세일이 정확히 언제 끝나는지 확인하세요. 12개 스토어 지역 중에 골라 그 지역 통화 기준으로 볼 수 있어요.",
    },
    {
      emoji: "🌐",
      title: "한국어 지원 필터",
      text: "한국어가 지원되지 않는 게임을 한눈에 표시하고, 필터로 걸러내거나 모아볼 수 있어요. 스팀의 언어 지원 정보를 그대로 읽어와요.",
    },
    {
      emoji: "🔎",
      title: "필요한 것만 걸러서 정렬",
      text: "할인율 구간(50%+ / 75%+), 장르, 한국어 지원으로 좁히고, 앞서 해보기·출시 예정·최저가 아닌 게임은 제외할 수 있어요. 가격, 할인율, 리뷰 비율, 메타크리틱, 세일 종료 임박순으로 정렬해요.",
    },
    {
      emoji: "🏆",
      title: "내 라이브러리 기록",
      text: "플레이중·완료·보류·하차 상태와 5점 별점, 추천/비추천을 남기고 게임별 업적 달성률을 확인하세요.",
    },
    {
      emoji: "🗳️",
      title: "투표 공유",
      text: "위시리스트나 라이브러리에서 몇 개를 골라 링크로 공유하면, 친구들이 로그인 없이 뭘 살지/뭘 먼저 할지 투표해요. 만든 투표와 결과는 언제든 다시 볼 수 있어요.",
    },
  ],
  stepsTitle: "세 단계로 시작하세요.",
  steps: [
    { title: "Steam ID64 찾기", text: "본인 프로필의 Steam ID64를 확인하세요." },
    { title: "위시리스트 불러오기", text: "ID64를 입력하고 위시리스트를 가져오세요." },
    { title: "탐색 및 비교", text: "검색, 필터, 정렬로 게임 정보를 살펴보세요." },
  ],
  howNote:
    "위시리스트를 못 불러온다면 스팀 프로필이 비공개일 수 있어요 - 스팀은 공개 데이터에서 비공개 프로필과 빈 프로필을 구분해주지 않아요.",
  previewTitle: "다음 구매를 더 명확하게.",
  heroAlt: "실제 위시리스트에 할인, 최저가, 메타크리틱, 리뷰 뱃지가 표시된 Steam Wishlist Tool 화면",
  previewDiscountAlt: "할인 중인 게임만 필터링해서 최저가/할인 종료일 뱃지가 표시된 위시리스트 화면",
  previewDiscountCaption: "할인 중인 게임으로 필터링하면 역대 최저가와 할인 종료 시점까지 확인할 수 있어요.",
  previewLibraryAlt: "보유 게임에 5점 별점과 추천 표시가 되어있는 라이브러리 화면",
  previewLibraryCaption: "라이브러리에서 게임을 평가하고 추천 표시를 남겨보세요.",
  finalCtaTitle: "다시 위시리스트를 둘러볼까요?",
  finalCtaDescription: "저장해둔 게임들을 새로운 시선으로 다시 봐요.",
  footerBrand: "Steam Wishlist Tool",
  footerGithub: "GitHub 저장소",
  footerOpenTool: "도구 열기",
  footerDisclaimer:
    "스팀 위시리스트를 둘러보고 게임 정보를 비교하는 개인용 소도구입니다. 이 프로젝트는 Valve나 Steam, IsThereAnyDeal과 무관한 독립 팬 프로젝트이며, 어떠한 제휴나 보증 관계도 없습니다. 스팀 관련 명칭과 상표는 설명 목적으로만 사용됩니다.",
};
