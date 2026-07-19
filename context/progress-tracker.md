# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Not started — specs complete, implementation not begun.

## Current Goal

- Phase 1: working review pipeline on the dev environment + minimal
  read-only dashboard.

## Completed

- Design interview complete; all seven context files written.

## In Progress

- None yet.

## Next Up

1. Scaffold Next.js app (App Router, TS strict, Tailwind, shadcn/ui,
   Drizzle, env validation in `lib/config/`).
2. Drizzle schema per `schemas.md` + first migration on Neon dev branch.
3. Register `diffguard-dev` GitHub App (permissions: PR RW, Contents RO,
   Metadata; events: pull_request, installation, installation_repositories);
   store secrets in Vercel dev project.
4. Webhook route: HMAC verify → Zod validate → skip rules → rate limit →
   enqueue QStash job with debounce delay.
5. Installation sync: handle installation / installation_repositories
   events into DB.
6. Worker route: QStash verify → idempotency + stale-SHA + daily-cap
   checks → diff fetch → pure core (filter/prioritize/prompt) →
   `generateObject` → render → comment upsert → persist.
7. Vitest for pure core with captured webhook fixtures.
8. End-to-end verification on scratch repo via webhook redelivery.
9. Minimal dashboard: Clerk GitHub OAuth, installations via
   `GET /user/installations`, reviews table + detail view, polling.
10. Install prod app (`DiffGuard`) on owner's real repos; dogfood.
11. Invite 4–5 beta users.

## Open Questions

- Exact cheap default model string at implementation time (Haiku 4.5 vs
  GPT-5.4-mini — A/B on own repos in week 1).
- Fallback GitHub App name if "DiffGuard" is taken at registration.
- Concrete values: debounce seconds (60–90), daily cap, rate-limit window
  — to be fixed as constants in `lib/config/`.

## Architecture Decisions

- Focus: general review with security emphasis; security findings always
  first. (Sharper security-only mode deferred to config, Phase 3.)
- Output: single summary comment, edit-in-place, commit footer;
  friendly-professional tone. Inline comments → Phase 2.
- Triggers: opened / synchronize / ready_for_review; skip drafts, bot
  authors, `[skip-review]`; QStash-delay debounce + head-SHA staleness
  check; full-diff review each run.
- Infra: single Next.js app on Vercel; webhook → QStash → worker; both
  endpoints signature-verified. No Railway service needed at this scope.
- Model: Vercel AI SDK, provider-agnostic via per-installation model
  string and single `getModel()`; cheap tier default; flagship models
  reserved for possible Phase 3 tiered routing.
- Persistence: review markdown + structured findings; never diffs
  ("we never store your code"). Usage derived from `reviews` rows.
- Permissions: PR RW + Contents RO + Metadata only; no Checks (leaner
  install screen; re-permission with 5 friendly users is cheap).
- LLM contract: `generateObject` + Zod; one retry; silent graceful
  failure — malformed output never reaches a PR.
- Context: PR title/body + changed-file tree + optional `.aireview.md` /
  `AGENTS.md` (delimited, add-only, untrusted). Full-file context →
  Phase 2; RAG out of scope.
- Auth: Clerk GitHub-OAuth-only; installation access derived from
  GitHub's `/user/installations` per session; no users table; no manual
  linking (removes an authorization vulnerability class).
- Reliability: idempotency on (repository, pr_number, head_sha) unique
  key; QStash retries; DLQ checked manually; maxDuration 300 with ~120s
  LLM abort.
- Protection: per-installation webhook rate limit + hardcoded daily
  review cap → worst-case daily spend is a chosen constant.
- Environments/testing: deploy-first (GitHub redelivery + Vercel logs);
  two GitHub Apps, two Vercel projects, two Neon branches, separate
  private keys; pure core unit-tested locally.
- Dashboard: minimal read-only, ships in Phase 1 as debug window; scope
  fence — only "did my PR go through and what happened".
- `schemas.md` added as seventh context file; updated in the same
  increment as any shape change.

## Session Notes

- Name: DiffGuard (`diffguard[bot]`); shield mark; check name
  availability at App registration.
- Beta users are free; feedback is the payment. Billing is Phase 3.
- Before rendering comments, remember skipped-files disclosure is the
  only "failure-ish" text that ever appears on a PR.
