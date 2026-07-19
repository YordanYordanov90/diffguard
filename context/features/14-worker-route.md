# Feature 14 — Worker Route (`app/api/jobs/review/route.ts`)

## Goal
Orchestrate one review end to end, idempotently. The only place I/O and
pure core meet.

## Depends on
04, 06, 09, 10, 11, 12, 13.

## Scope (do)
- `export const maxDuration = 300`.
- Verify QStash signature → Zod-validate ReviewJob → then:
  1. getReviewBySha: already completed → 200 exit (idempotency).
  2. fetchPrHeadSha: job SHA no longer head → markReviewSkipped
     `stale_sha`, exit (debounce resolution).
  3. countReviewsToday ≥ cap → markReviewSkipped `daily_cap`, exit.
  4. markReviewRunning → fetchPrDiff + fetchInstructionsFile →
     diff processing (10) → prompt (11) → LLM (13) → render (12) →
     upsertComment (06) → markReviewCompleted (markdown, comment id,
     verdict, severity counts, tokens, duration, skipped files).
- ReviewFailedError or any throw → markReviewFailed(error text), 500
  (QStash retries; idempotency makes retries safe). No comment posted on
  failure — silence on the PR.
- Never log diff or prompt contents.

## Out of scope
Any UI. New pure logic (only composition here). Alerting/DLQ automation.

## Verification
Unit test the orchestration order with mocked deps (esp. early exits).
Deployed: PR on scratch repo → one comment; push again → comment edited
in place; push twice fast → one review, one `stale_sha` skip.
