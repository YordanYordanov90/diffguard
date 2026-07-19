# Feature 06 — GitHub Client (`lib/github/`)

## Goal
All GitHub API access behind typed helpers using short-lived installation tokens.

## Depends on
02, 05.

## Scope (do)
- App JWT + installation token minting (tokens never persisted or logged).
- fetchPrDiff(installationId, repoFullName, prNumber) → unified diff string.
- fetchPrHeadSha(...) → current head SHA (for stale-SHA check).
- fetchInstructionsFile(...) → `.aireview.md` else `AGENTS.md` else null,
  truncated to INSTRUCTIONS_TOKEN_CAP.
- upsertComment(installationId, repoFullName, prNumber, commentId | null,
  body) → comment id (create or edit-in-place).
- getUserInstallations(userOauthToken) → installation ids the user can
  access (dashboard authorization source).

## Out of scope
Webhook handling, worker orchestration, any DB writes.

## Verification
Unit tests with mocked Octokit responses; manual smoke against the scratch
repo from the dev deployment (Feature 15 covers full e2e).
