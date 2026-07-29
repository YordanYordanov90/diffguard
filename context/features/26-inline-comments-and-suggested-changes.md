# Feature 26 — Inline Review Comments & Suggested Changes

## Goal

Put a small number of high-confidence findings on the exact changed lines and
offer apply-ready GitHub suggestions only when DiffGuard can validate a safe,
precise replacement.

## Depends on

24, 25.

## Scope (do)

- Map eligible finding locations to GitHub's current `line`/`side` review
  comment coordinates. Do not use the closing-down `position` parameter.
- Submit one GitHub `COMMENT` review containing all eligible inline comments
  for the head SHA. Keep the existing edit-in-place summary comment as the
  canonical complete review.
- A candidate must first survive Feature 24 and exist as a confirmed Feature
  25 finding. Candidate confidence alone never makes it publishable.
- Inline eligibility is conservative:
  - location maps to a changed line at the current head SHA;
  - confidence is high;
  - critical/high findings are eligible;
  - medium findings are eligible only while under the inline noise cap;
  - low/info and file-level findings remain in the summary.
- Cap inline output at eight comments per review, ordered by security,
  severity, confidence, and file risk. Disclose in the summary when additional
  findings remain summary-only.
- Add a bounded structured `suggestedChange` object to the LLM contract for
  exact replacement ranges and replacement text. Preserve the existing prose
  suggestion for findings that cannot produce an apply-ready edit.
- Render a GitHub suggestion block only when its path and complete range are
  inside one changed hunk, the original lines match the current head, and the
  replacement stays within size and line-count limits. The range must include
  the confirmed finding line.
- Never submit `APPROVE` or `REQUEST_CHANGES`; merge gating remains a later
  product decision.
- Persist returned review-comment ids on the matching Feature 25 finding rows.
  A retry must reuse recorded ids or skip already-published fingerprints.
- Use the existing `Pull requests: write` permission. Do not expand App
  permissions for this feature. GitHub documents that permission for creating
  review comments and reviews:
  <https://docs.github.com/en/rest/pulls/comments> and
  <https://docs.github.com/en/rest/pulls/reviews>.

## Safe degradation

- If one location or suggestion fails validation, post the finding in the
  summary without an inline comment.
- If GitHub rejects a batch, retry once without invalid inline entries. The
  summary review must still complete successfully.
- Recheck the PR head immediately before inline publication; a stale result
  becomes summary-only. Once GitHub accepts a review POST, retry only comment
  retrieval and never post a second review for that accepted request.
- Secondary rate limiting or inline publishing failure is recorded safely and
  must not duplicate the summary or mark valid LLM output as malformed.

## Security invariants

- Suggested changes are never applied automatically, committed, or pushed.
- Repository content and LLM-proposed replacement ranges are independently
  validated against the exact head SHA immediately before publishing.
- Comment bodies contain no hidden prompt, source context, token, or raw
  provider error.

## Out of scope

Automatic commits, branch writes, fix-all, request-changes reviews, merge
checks, multi-file suggestions, or resolving old comment threads.

## Verification

- Pure tests cover diff-coordinate mapping, additions/deletions, multi-line
  ranges, outdated heads, noise-cap ordering, and suggestion rejection.
- PR #38's rejected accessibility and speculative visual candidates must
  produce neither inline comments nor summary findings.
- GitHub client tests cover one batched review, idempotent retry, partial
  fallback, and current API fields.
- End-to-end verification confirms a valid suggestion can be applied by the PR
  author and that an invalid location appears only in the summary.
