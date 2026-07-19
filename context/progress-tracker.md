# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 1 implementation — project scaffold complete; configuration is next.

## Current Goal

- Phase 1: working review pipeline on the dev environment + minimal
  read-only dashboard.

## Completed

- Design interview complete; all seven context files written.
- Feature 00 (GitHub App & environment setup) — mostly done 2026-07-19:
  `diffguard-dev` GitHub App registered; Neon, Upstash QStash+Redis,
  Clerk, and an LLM provider key all provisioned and stored in
  `.env.local`. Remaining: scratch test repo + install and updating the
  GitHub App's webhook URL to the deployed app once the webhook route exists.
- Feature 01 (Project Scaffold) — completed 2026-07-19:
  Next.js App Router scaffold with strict TypeScript, Tailwind v4 tokens,
  shadcn/ui configuration, required runtime/tooling dependencies, pure-core
  folder boundaries, Vitest configuration and smoke test. Local lint, tests,
  and production build pass. Deployed to Vercel at
  `https://diffguard-one.vercel.app` (deployment ready).
- Feature 02 (Config & Env Validation) — completed 2026-07-19:
  Zod environment schema, typed startup parser, centralized constants,
  OpenAI/Anthropic provider resolution, safe configuration errors, and unit
  tests for missing variables and provider keys. Local lint, tests, and
  production build pass. Provider adapters are installed; runtime secrets
  still need to be added to the Vercel project before server routes use them.
- Feature 03 (Database Schema & Migration) — completed 2026-07-19:
  Drizzle schema for installations, repositories, and reviews; Postgres
  enums, tenant foreign keys, idempotency unique constraint, dashboard/daily
  cap index, Neon serverless client, and generated migration. Migration
  applied successfully to the configured Neon database. Local lint, tests,
  and production build pass.

## In Progress

- Feature 04: query layer, next up.

## Next Up

1. Typed Drizzle query layer with tenant isolation (Feature 04).
3. ~~Register `diffguard-dev` GitHub App~~ — done 2026-07-19 (permissions:
   PR RW, Contents RO, Metadata RO; events: pull_request, plus
   installation/installation_repositories which are delivered
   automatically). Private key generated and base64-encoded locally.
   Still TODO: set webhook secret if not already set, store all app
   secrets in the Vercel project's env vars once that project exists.
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
10. Install the same `diffguard-dev` app on owner's real repos; dogfood.
11. Invite 4–5 beta users.

## Open Questions

- Concrete values: debounce seconds (60–90), daily cap, rate-limit window
  — chosen for Feature 02 as 75 seconds, 20 reviews/day, and 10 events/minute
  per installation; revisit after dev verification.

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
  ONE GitHub App (`diffguard-dev`, created 2026-07-19), ONE Vercel
  project, ONE Neon database — no separate prod app/env. Verify on the
  scratch repo first, then install the same app on real repos when
  ready; promote by updating env vars/secrets in place, not by
  standing up a second app. Pure core unit-tested locally regardless.
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
