@AGENTS.md

# Workflow

Production (`main`, Vercel) is shared with real users. Work on `feature/genre-leveling`; `main` only
ever receives reviewed, built, content-identical cherry-picks.

## Stages

1. **Plan** - for a new feature or behavior change, use the `plan` skill: situation check (fetch, does
   it already exist?), plan + TODO, a read-only reviewer challenges it, rebuttal, then the user decides.
   Bug fixes and copy tweaks skip this.
2. **Build** - implement the approved TODOs; use the `--space-*` tokens in `app/globals.css`.
3. **QA** - for UI changes, drive the real page with Playwright (temporary script, deleted after) and
   look at the new element next to its neighbors, on desktop and ~360px mobile. Report what was seen.
4. **Commit** - one focused commit per change.
5. **Push** - "푸시" / "커밋후 푸시" means the feature branch only.
6. **Deploy** - only when the user explicitly says so ("배포해", "실섭 배포", "메인에 푸시하자"). Use
   the `deploy` skill. A read-only review of the diff happens before anything touches `main`.

## Hard rules

- Never push or merge to `main` without an explicit deploy request. Approval does not carry over to
  the next deploy.
- Never print secrets from `.env.local`.
- Confirm `GENRE_TASTE_ENABLED = false` in `app/genres.ts` before each deploy (genre levels are live; taste/recommend stay off until docs/genre-taste-eval.md says otherwise).
- The reviewer in a review step is read-only: it reports findings, it does not fix them.


<!-- BEGIN PROJECT-DESK WRAP-UP -->
## Project Desk 작업 마무리

매 수정마다 기록하지 않는다. 사용자의 작업을 마무리하기 직전, 대기 중인 정리 요청이 있는지 한 번 확인한다. 기존 프로젝트 규칙과 역할·검증·배포 제한은 그대로 따른다.

확인 명령:
```text
node "D:/Project/project-manager/scripts/project-review.mjs" status --project steam-wishlist-next-v2
```

pending이 null이면 추가 기록 없이 종료한다. 요청이 있으면 이번 대화에서 수행한 작업을 UTF-8 JSON 임시 파일에 정리한다. 필수 문자열 필드: actor(Claude/Codex 등 담당), summary(완료한 변경), validation(실제로 실행한 검증 명령과 결과; 미실행은 미실행), remaining(남은 일·문제), next(다음 작업). 모르는 현황이나 실행하지 않은 검증을 지어내지 않는다.

확인 응답의 pending.id로 제출한다:
```text
node "D:/Project/project-manager/scripts/project-review.mjs" complete --project steam-wishlist-next-v2 --request "<pending.id>" --file "<보고서.json 경로>"
```

성공 응답을 확인한 뒤 자신이 만든 임시 보고서만 정리한다. 서버가 꺼져 있거나 제출에 실패하면 보고서를 보존하고 미제출 상태를 사용자에게 알린다. 409 응답이면 요청을 다시 확인하며 다른 AI의 완료 결과를 덮어쓰지 않는다. 기존 사용자 TODO·프로젝트 현황·소스 코드를 이 요청 때문에 변경하지 않는다. 정리 요청은 작업 범위를 확대하거나 AI를 새로 실행하라는 지시가 아니다.
<!-- END PROJECT-DESK WRAP-UP -->
