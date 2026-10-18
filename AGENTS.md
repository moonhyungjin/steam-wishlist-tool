<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


<!-- BEGIN PROJECT-DESK WRAP-UP -->
## Project Desk 작업 정리 (배포 기준)

이 프로젝트는 배포 단위로 기록한다. 실서버 배포를 마치고 반영까지 확인한 직후에만 대기 중인 정리 요청을 확인한다. 그 외의 작업 마무리 시점에는 확인하지 않는다. 요청이 있으면 이번 배포에 나간 변경을 기준으로 보고서를 쓴다. 사용자가 "기록해줘"처럼 기록을 직접 요청하면 기준과 관계없이 그 시점에 바로 확인하고 제출한다. 기존 프로젝트 규칙과 역할·검증·배포 제한은 그대로 따른다.

확인 명령:
```text
node "D:/Project/project-manager/scripts/project-review.mjs" status --project steam-wishlist-next-v2
```

pending이 null이면 추가 기록 없이 종료한다. 요청이 있으면 수행한 작업을 UTF-8 JSON 임시 파일에 정리한다. 필수 문자열 필드: actor(Claude/Codex 등 담당), summary(이번 배포에 나간 변경), validation(실제로 실행한 검증 명령과 결과; 미실행은 미실행), remaining(남은 일·문제), next(다음 작업). 모르는 현황이나 실행하지 않은 검증을 지어내지 않는다.

확인 응답의 pending.id로 제출한다:
```text
node "D:/Project/project-manager/scripts/project-review.mjs" complete --project steam-wishlist-next-v2 --request "<pending.id>" --file "<보고서.json 경로>"
```

성공 응답을 확인한 뒤 자신이 만든 임시 보고서만 정리한다. Project Desk 서버가 꺼져 있으면 스크립트가 보고서를 보관함(data/inbox)에 저장하고 queued로 응답하는데, 이것도 정상 제출이다. 그 밖의 이유로 제출에 실패하면 보고서를 보존하고 미제출 상태를 사용자에게 알린다. 409 응답이면 요청을 다시 확인하며 다른 AI의 완료 결과를 덮어쓰지 않는다. 기존 사용자 TODO·프로젝트 현황·소스 코드를 이 요청 때문에 변경하지 않는다. 정리 요청은 작업 범위를 확대하거나 AI를 새로 실행하라는 지시가 아니다.
<!-- END PROJECT-DESK WRAP-UP -->
