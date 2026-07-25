# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Phase 1 core pipeline and dashboard foundation are complete.
- Dashboard operations expansion (Features 18–20) is implemented.

## Current Goal

- Install `diffguard-dev` on the owner's real repositories, dogfood the
  expanded dashboard, then invite 4–5 beta users.

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
- Feature 04 (Query Layer) — completed 2026-07-21:
  Typed Drizzle query functions for installation lifecycle, repository sync,
  idempotent review queueing, review state transitions, daily-cap counting,
  and tenant-scoped dashboard reads. Repository ownership is checked before
  queue insertion, review claiming is atomic for queued/retryable states, and
  all review queries filter by installation ID. Lint, existing Vitest suite,
  and production build pass. A dedicated Neon test branch or pglite fixture
  is still needed for database integration tests.
- Feature 05 (Boundary Schemas) — completed 2026-07-21:
  Zod schemas for pull request, installation, and repository synchronization
  webhook payloads; the QStash review job; and the structured LLM review
  output. Schemas strip unknown payload fields, validate 40-character
  hexadecimal SHAs, enforce enum values, and export inferred TypeScript
  types. Ten Vitest tests, lint, and the production build pass.
- Feature 06 (GitHub Client) — completed 2026-07-21:
  Typed GitHub App helpers for short-lived installation authentication, PR
  diff/head-SHA retrieval, `.aireview.md`/`AGENTS.md` instruction fallback
  with size limiting, edit-in-place comment upsert, and paginated
  authenticated user installation access. Unsupported oversized instruction
  responses are ignored safely. Tokens and private keys remain in memory only
  and are never logged or persisted. Fifteen Vitest tests, lint, and the
  production build pass; manual scratch-repo smoke testing remains for
  Feature 15 end-to-end verification.
- Feature 07 (Webhook Route) — completed 2026-07-22:
  Secure GitHub webhook front door with raw-body HMAC verification, timing-safe
  signature comparison, event-specific Zod validation, dispatch stubs, unknown
  event no-op handling, and the standard response envelope. Malformed signed
  payloads return 400, invalid signatures return 401, and handler failures
  return a retryable 500 without exposing raw errors. Twenty Vitest tests,
  lint, and the production build pass.
- Feature 08 (Installation Sync) — completed 2026-07-22:
  Installation handlers now upsert created installations and repositories,
  delete installations with cascade cleanup, update suspended state, and
  synchronize added/removed repositories. The handlers are wired into the
  webhook route while database imports remain deferred until after signature
  and payload validation. Twenty-three Vitest tests, lint, and the production
  build pass.
- Feature 09 (Review Trigger) — completed 2026-07-22:
  Pull request triggers now ignore unsupported actions, skip drafts/bot
  authors/`[skip-review]`, suppress suspended or disabled repositories, apply
  per-installation rate limits and daily caps, create idempotent queued
  reviews, and publish delayed ReviewJob payloads to QStash. Thirty-two
  Vitest tests, lint, and the production build pass.
- Feature 10 (Diff Processing) — completed 2026-07-22:
  Pure unified-diff parsing now filters lockfiles, generated assets, binaries,
  images, and vendored dependencies; ranks security-sensitive paths first;
  fills the configured approximate token budget atomically by file; and
  reports skipped files for disclosure. Focused tests cover exclusions,
  ranking, cutoff behavior, determinism, and new/deleted files.
- Feature 11 (Prompt Builder) — completed 2026-07-22:
  Pure prompt assembly now produces stable system and user messages with
  security-first review rules, the ReviewOutput contract, line-number safety,
  ordered PR context, skipped-file disclosure, and delimited untrusted
  repository instructions. Tests cover snapshots, optional instructions,
  delimiters, section order, and safety rules.
- PR #22 Codex feedback fixes — completed 2026-07-22:
  Draft reviews now requeue on `ready_for_review`, queued reviews can be
  republished after transient QStash failures, daily-cap checks occur before
  inserting eligible candidates, and root-level security-sensitive files are
  ranked correctly.
- Feature 12 (Comment Renderer) — completed 2026-07-22:
  Pure markdown rendering now produces deterministic security-first review
  comments with severity badges, line-aware locations, collapsible low/info
  findings, skipped-file disclosure, zero-findings handling, and commit
  footers. Snapshot tests cover full, empty, skipped-file, and file-level
  finding cases.
- Feature 13 (LLM Call) — completed 2026-07-22:
  Provider-agnostic structured generation now resolves the installation model,
  validates against `ReviewOutput`, enforces a shared abort timeout, retries
  one parse/schema failure with bounded validation feedback, aggregates token
  usage, and throws `ReviewFailedError` after graceful failure. Tests cover
  success, retry, double failure, and timeout abort behavior; tests, lint, and
  production build pass.
- Feature 14 (Worker Route) — completed 2026-07-22:
  QStash verification, job validation, idempotent/stale-SHA/daily-cap exits,
  review pipeline orchestration, comment persistence, and retryable failure
  handling are implemented with mocked orchestration tests. Fifty-six Vitest
  tests, lint, and the production build pass.
- PR #23 review feedback — fixes completed 2026-07-22:
  prompt delimiter escaping, cross-SHA comment reuse, terminal LLM failure
  acknowledgement, daily-cap boundary, PR metadata propagation, and one
  shared LLM timeout deadline are covered by code and tests.
- Feature 15 (End-to-end dev verification) — completed 2026-07-25:
  `diffguard-dev` was verified on the isolated `YordanYordanov90/weather-app`
  repository. GitHub webhook delivery, installation synchronization, QStash
  debounce, signed worker processing, database completion, security finding
  detection, and the final PR comment all passed. A second push reused the
  same GitHub comment ID, confirming edit-in-place behavior.
- Feature 16 (Dashboard auth & access resolution) — completed 2026-07-25:
  Clerk is linked to the DiffGuard app for identity, then the dashboard starts
  a one-time GitHub App user authorization when needed. Access and refresh
  tokens are AES-256-GCM encrypted in Upstash Redis, refresh automatically,
  and resolve installations through GitHub's `/user/installations` endpoint.
  A five-minute cache is keyed by Clerk user id; missing or expired access
  redirects to reauthorization and installation IDs are never trusted from
  client input. Focused auth tests, lint, the full 75-test Vitest suite, and
  the production build pass.
- Dashboard onboarding polish — completed 2026-07-25: GitHub authorization is
  now an explicit dashboard action rather than an immediate redirect. A second
  dashboard state links users to GitHub's App installation screen to choose
  repositories, then explains how to trigger their first PR review. The App
  slug is configurable through `GITHUB_APP_SLUG` (default `diffguard-dev`).
- Custom Clerk auth UI — completed 2026-07-25: the sign-in and sign-up pages
  now use a native DiffGuard GitHub access panel built on Clerk's `useSignIn`
  and `useSignUp` hooks. Clerk's redirect callback component retains OAuth
  session completion and sign-up CAPTCHA protection; the generic embedded
  Clerk card is no longer rendered.
- Feature 17 (Dashboard UI) — completed 2026-07-25:
  Read-only reviews table (repo mono, GitHub PR link, status badge, findings
  count, model, duration, timestamp) with ~5s polling + manual refresh;
  detail sheet for markdown body, failed error callout, and skipped-reason
  badge. Data loads only through GitHub-derived dashboard access →
  `listReviews` (no client-supplied installation IDs). shadcn table/badge/
  sheet/button/skeleton added and mapped to DiffGuard tokens. Format helper
  unit tests, full Vitest suite (67), lint, and production build pass.
- Dashboard operations specification — completed 2026-07-25 (documentation
  only): Features 18–20 define the responsive shell, coverage-first overview,
  and repository inventory. The architecture, GitHub access contract, UI
  vocabulary, responsive behavior, security boundary, and progress plan are
  synchronized across `context/`. No application code changed.
- Feature 18 (Dashboard shell & navigation) — completed 2026-07-25:
  responsive desktop sidebar, mobile Sheet navigation, active route state,
  focused onboarding header, stable `/dashboard/reviews` route, and a
  lightweight Overview landing page using existing review data. Repository
  navigation is intentionally deferred until Feature 20 creates its route.
  Lint, all 75 tests, and the production build pass.
- Feature 19 (Dashboard overview) — completed 2026-07-25:
  GitHub access resolution now returns validated `AccessibleInstallation`
  descriptors (id, account, `repository_selection`, github.com `html_url`,
  suspension). Shared tenant-scoped queries list repositories, latest review
  metadata, and reviews-today counts. `/dashboard` leads with the coverage
  rail, restrained summary totals, recent reviews with existing detail sheet
  behavior, and directed empty/error states. Installation scope remains
  GitHub-derived only. Lint, all 85 Vitest tests, and production build pass.
- Feature 20 (Repository coverage) — completed 2026-07-25:
  `/dashboard/repositories` groups authorized repos by installation with
  access mode, suspended/active state, coverage labels, `Manage on GitHub`
  (validated `html_url`), `View reviews`, and `Open on GitHub`. Client-side
  search, stable attention-first sorting, cache-invalidating Refresh, and a
  server-side allowlisted repository filter on `/dashboard/reviews` are
  included. Navigation now links Overview, Reviews, and Repositories. Lint,
  full Vitest suite, and production build pass.

## In Progress

- None.

## Next Up

1. Install `diffguard-dev` on owner's real repositories, dogfood the expanded
   dashboard, then invite 4–5 beta users.
2. Later Phase 2 candidates: inline comments and full-file context.

## Open Questions

- Concrete values: debounce seconds (60–90), daily cap, rate-limit window
  — chosen for Feature 02 as 75 seconds, 20 reviews/day, and 10 events/minute
  per installation; revisit after dev verification.
- None blocking Features 18–20. Settings, billing, usage analytics, and
  in-app repository mutations remain explicitly deferred.

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
- Auth: Clerk supplies identity; a separate one-time GitHub App user OAuth
  grant supplies `/user/installations` access. Tokens are encrypted in Redis,
  refresh automatically, and are keyed by Clerk user id. There is no users
  table or manual installation linking.
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
- Dashboard: read-only operations workspace with focused onboarding followed
  by Overview, Reviews, and Repositories. Desktop uses a persistent sidebar;
  mobile uses a compact top bar and Sheet navigation. The signature coverage
  rail makes installation/repository protection visible without generic
  analytics decoration.
- Repository access: GitHub owns `All repositories` versus
  `Selected repositories`. DiffGuard validates and displays GitHub installation
  metadata and opens the installation's GitHub configuration URL; it never
  grants itself access or trusts client-supplied installation IDs.
- `schemas.md` added as seventh context file; updated in the same
  increment as any shape change.

## Session Notes

- Name: DiffGuard (`diffguard[bot]`); shield mark; check name
  availability at App registration.
- Beta users are free; feedback is the payment. Billing is Phase 3.
- Before rendering comments, remember skipped-files disclosure is the
  only "failure-ish" text that ever appears on a PR.
