# Feature 27 — Incremental Review Baseline

## Goal

Review only the changes introduced since the last successful DiffGuard review
while preserving a safe full-review fallback for force pushes and incomplete
history.

## Depends on

14, 25, 26.

## Scope (do)

- Add a review mode contract to `schemas.md` and the database:
  `full`, `incremental`, or `fallback_full`.
- At worker start, find the latest completed review for the same tenant,
  repository, and PR. Never accept the previous SHA from the webhook or
  client.
- Confirm through GitHub that the stored previous SHA belongs to the current
  PR history and compare it with the validated current head SHA.
- For a normal descendant update, fetch and review only the commit range from
  the previous reviewed SHA to the current head.
- Fall back to the full PR diff when there is no completed review, the base is
  unavailable, history was rewritten, GitHub comparison is truncated, or the
  incremental result cannot be trusted.
- Run the same exclusion, prioritization, context, token-budget, prompt,
  schema-validation, and rendering rules for both modes.
- Include the review mode and compared SHA range in safe metadata and the
  summary footer. Do not persist either diff.
- Preserve idempotency on `(repository_id, pr_number, head_sha)` and the
  existing stale-head check immediately before publication.
- Add an internal full-review override that Feature 34 can invoke later. It is
  not user-accessible in this increment.

## Security invariants

- Incremental mode must not skip validation of existing high/critical findings
  whose files changed in the compared range; Feature 28 defines reconciliation.
- A comparison failure always broadens to the full PR diff rather than
  silently reviewing an incomplete range.
- All comparison requests stay within the authorized repository and use exact
  server-resolved SHAs.
- No commit diff or file content is logged or persisted.

## Out of scope

Finding resolution, pause/resume commands, public manual review commands,
conversation memory, or changes to the daily review cap.

## Verification

- Tests cover first review, normal descendant commits, unrelated SHAs, force
  pushes, deleted commits, truncated comparison, stale head, and full fallback.
- Review records store the correct mode without weakening the unique
  idempotency key.
- Two pushes after an initial review analyze only the new range and do not
  re-send unchanged source to the LLM.
- A force-push fixture produces a disclosed `fallback_full` review rather than
  a partial result.
