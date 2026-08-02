# DiffGuard

## Overview

DiffGuard is an AI-powered pull request reviewer delivered as a GitHub App.
Users install it once on their GitHub account or organization; from then on,
every pull request in enabled repositories receives an automated review
posted as a single summary comment — general code review with a strong,
always-first security emphasis. It removes the need to configure per-repo
CI review scripts and is built to serve the owner plus 4–5 beta users,
with a multi-tenant foundation that can scale later.

## Goals

1. Kill the owner's per-repo review-setup pain: install once, reviews
   appear on every PR automatically.
2. Serve 4–5 external beta users on the same deployment with full
   tenant isolation and bounded LLM cost.
3. Produce reviews that are consistently formatted, security-first,
   and low-noise (no comment spam, no malformed output ever posted).
4. Serve as a portfolio-grade project demonstrating GitHub App,
   queue-based, and AI SDK architecture.

## Core User Flow

1. User installs the DiffGuard GitHub App and selects repositories
   (GitHub's own install screen — no custom UI).
2. User opens a pull request (or pushes to one / marks ready for review).
3. GitHub sends a webhook; DiffGuard verifies, debounces, and queues
   a review job.
4. The worker fetches the diff, builds context, calls the LLM, and posts
   (or edits in place) one summary comment on the PR.
5. User signs into the dashboard with GitHub (Clerk) and sees an operations
   workspace for installations GitHub says they can access — and only those.
   The workspace shows repository coverage, recent activity, and review
   history. Repository permission changes always return to GitHub.

## Features

### Review Pipeline (Phase 1)

- GitHub App webhook receiver with signature verification
- QStash-queued review jobs with debounce and idempotency
- Provider-agnostic LLM review via Vercel AI SDK (`generateObject` + Zod)
- Single edit-in-place summary comment: security findings first,
  severity badges, collapsible low-severity section, commit footer
- Skip logic: drafts, bot authors, `[skip-review]` in PR title
- Diff token budget with risk-ranked file prioritization and explicit
  disclosure of skipped files
- Per-installation rate limit and hardcoded daily review cap

### Dashboard Foundation (Phase 1, complete)

- Clerk sign-in via GitHub OAuth only
- Reviews table: repo, PR link, status badge, findings count, model,
  duration, timestamp; light polling refresh
- Review detail view: stored review markdown + error text on failure

### Dashboard Operations Expansion (complete)

- Responsive left-sidebar workspace with Overview, Reviews, and Repositories
- Coverage-first overview grouped by GitHub installation/account
- Repository inventory with access mode, latest review state, and a secure
  `Manage on GitHub` path
- GitHub remains the repository-selection source of truth; DiffGuard never
  grants itself repository access

### Review Quality Expansion (Phase 2)

- Smart full-file context followed by bounded one-hop related-code context
  to reduce false positives without cloning or persisting repositories
- An independent finding-evidence adjudication gate with PR #38 regression
  fixtures, followed by durable finding identities
- High-confidence inline comments and validated GitHub suggested changes while
  the edit-in-place summary remains canonical
- Incremental reviews with new/open/resolved finding reconciliation so later
  pushes do not repeat unchanged feedback
- Linked GitHub Issue requirement validation using explicit closing references
- Explicit collaborator feedback and governed repository learnings that remain
  subordinate to DiffGuard's immutable security rules

The implementation ledger splits this work into Features 22–32 so each
security boundary, migration, and pipeline change can be verified separately.

### PR Conversation

- A permission-gated, rate-limited GitHub comment boundary
- PR-scoped questions and deterministic review controls such as review,
  full review, pause, and resume
- Explanatory only: no branch writes, commits, tool execution, or persistent
  conversation memory

Features 33–34 remain subordinate to automatic review quality. Review accuracy,
context, inline usefulness, incremental behavior, and learnings must be
dogfooded before conversation becomes a primary surface.

### Review Trust Verification (planned)

- Finding-specific retrieval of authorization helpers, database constraints,
  migrations, tests, and explicit feature intent for severe candidates
- A fail-closed third verification stage: high/critical findings publish only
  after complete evidence and independent structured confirmation
- A sanitized offline evaluation corpus and release gates for precision,
  severity calibration, duplicate suppression, cost, and latency

The implementation ledger splits this work into Features 35–37. It extends,
rather than replaces, Feature 24's general false-positive gate.

### Later (Phase 3 — out of MVP)

- Per-installation configuration UI (model tier, strictness, caps)
- Billing, plans, usage UI
- Checks API integration ("block merge on critical findings")

## Scope

### In Scope

- One Next.js app on Vercel: webhook route, worker route, dashboard
- Multi-tenant data model keyed on GitHub installation from day one
- One GitHub App, Vercel project, and Neon database promoted in place from
  scratch-repository verification to real-repository use
- Storing review output and structured findings metadata

### Out of Scope

- Storing diffs or any repository source code in the database
- RAG / whole-repo context, Checks API, billing, admin alerting
- Any sign-in method other than GitHub OAuth via Clerk
- Websockets / realtime dashboard updates (polling only)

## Success Criteria

1. Opening a PR on an enabled repo results in exactly one DiffGuard
   summary comment, updated in place on subsequent pushes.
2. A second user installing the app sees only their own installations,
   repositories, coverage state, and reviews in the dashboard.
3. A burst of pushes to one PR produces one review (debounce + head-SHA
   check), and a failed job never posts a malformed comment.
4. Daily LLM spend is bounded by the per-installation cap regardless of
   user behavior.
5. `npm run build` passes and the pipeline runs end to end on the scratch
   repository before the same App is installed on real repositories.
6. The dashboard accurately reflects `All repositories` versus
   `Selected repositories` and sends every permission change to GitHub.
