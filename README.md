# Steam Wishlist Next.js Demo v0.2

Steam Wishlist의 App ID를 가져온 다음 Store appdetails에서 게임명, 이미지, 가격, 할인율, 장르, 출시일, Metacritic을 추가합니다.

`npm install` → `npm run dev` → http://localhost:3000

찜목록이 902개처럼 많으면 30개씩 나눠 가져오며 진행률을 보여줍니다.

`store.steampowered.com/api/appdetails`는 Steamworks 공식 Web API 문서에 정식으로 문서화된 인터페이스는 아니므로 개인용 도구를 전제로 사용합니다.

다음 단계: 평균 플레이타임, 시간당 가격, 검색/필터/정렬, SQLite 저장.
