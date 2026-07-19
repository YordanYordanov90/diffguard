# Feature 04 — Query Layer (`lib/db/queries.ts`)

## Goal
All DB access the app needs, as typed functions — no inline SQL in routes.

## Depends on
03.

## Scope (do)
- upsertInstallation, suspendInstallation, deleteInstallation
- syncRepositories(installationId, added[], removed[])
- createQueuedReview(job) — insert or return existing on the unique key
- getReviewBySha(repositoryId, prNumber, headSha)
- markReviewRunning / markReviewCompleted / markReviewFailed / markReviewSkipped
- countReviewsToday(installationId) — for the daily cap
- listReviews(installationIds[], limit) and getReviewDetail(id,
  installationIds[]) — dashboard reads
- Invariant enforced here: every function touching tenant data takes and
  filters by installation id(s). No query bypasses this layer.

## Out of scope
Routes, GitHub API, LLM. No schema changes.

## Verification
Unit tests against a Neon test branch (or pglite): idempotent
createQueuedReview on duplicate key; countReviewsToday excludes skipped.
