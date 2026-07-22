# Feature 09 — Review Trigger (pull_request handler)

## Goal
Decide review / skip, record it, and enqueue the debounced job.

## Depends on
04, 07, 08.

## Scope (do)
- Only actions opened / synchronize / ready_for_review proceed.
- Skip checks in order (record skip with reason, no comment):
  draft PR → `draft`; user.type === "Bot" → `bot_author`;
  `[skip-review]` in title → `skip_keyword`; installation suspended or
  repo disabled → no row at all.
- Upstash sliding-window rate limit per installation → `rate_limited`.
- Daily cap pre-check via countReviewsToday → `daily_cap`.
- createQueuedReview (idempotent on the unique key; existing queued reviews
  may be republished for delivery recovery, while completed/failed reviews
  exit as duplicates).
- Publish ReviewJob to QStash with DEBOUNCE_SECONDS delay, target
  `/api/jobs/review`.

## Out of scope
The worker itself (14). Diff/LLM/rendering. Comment posting.

## Verification
Unit tests per skip rule with fixture events. Deployed: open a PR on the
scratch repo → review row `queued` in DB and a delayed QStash message
visible in the Upstash console.
