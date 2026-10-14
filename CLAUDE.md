@AGENTS.md

# Workflow

Production (`main`, Vercel) is shared with real users. Work on `feature/genre-leveling`; `main` only
ever receives reviewed, built, content-identical cherry-picks.

## Stages

1. **Plan** - for anything beyond a small fix, write the scope and a TODO checklist first and get the
   user's OK before coding.
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
- Confirm `GENRE_LEVELING_ENABLED = false` in `app/wishlist.tsx` before each deploy.
- The reviewer in a review step is read-only: it reports findings, it does not fix them.
