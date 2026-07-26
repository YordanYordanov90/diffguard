# Feature 28 — Finding Reconciliation

## Goal

Track findings across incremental pushes as new, still open, or resolved so
DiffGuard stops repeating unchanged feedback and visibly recognizes fixes.

## Depends on

25, 26, 27.

## Scope (do)

- Load existing open findings for the tenant, repository, and PR before an
  incremental review.
- Mark an existing finding as eligible for re-evaluation only when its file or
  validated context anchor was touched by the incremental range. Unaffected
  findings remain open and are never inferred resolved from absence.
- Supply eligible finding ids and bounded descriptions to the prompt in a
  system-controlled section. They are prior model output, not repository
  instructions.
- Extend structured output with finding updates that may reference only the
  allowlisted ids supplied for re-evaluation. Each update is `open` or
  `resolved` with a short reason.
- Reconcile new output in a transaction:
  - matching fingerprints update `last_seen_sha` and current location;
  - new fingerprints create open findings;
  - validated resolved ids receive `resolved_sha`;
  - omitted or invalid updates leave the existing finding open.
- Render the canonical summary with compact `New`, `Still open`, and
  `Resolved in this update` sections. Severity ordering remains
  security-first.
- Do not repost an inline comment for an already-published open fingerprint.
  When a finding is first resolved, reply once to its existing inline thread;
  do not delete or rewrite human conversation history.
- A later recurrence after resolution becomes open again only when current
  evidence produces the same fingerprint; the summary must identify it as
  recurring.

## Security invariants

- The LLM cannot resolve arbitrary finding ids, dismissed findings, findings
  from another PR, or findings from another installation.
- Resolution is fail-closed: ambiguity preserves `open`.
- Reconciliation and review completion are transactionally consistent so a
  retry cannot double-resolve, double-reply, or lose an open finding.
- Human dismissal from Feature 30 outranks LLM reconciliation.

## Out of scope

General PR chat, learned preferences, issue validation, deleting GitHub
threads, automatic code changes, or merge blocking.

## Verification

- Unit tests cover new, unchanged, moved, resolved, recurring, omitted,
  invalid-id, and dismissed finding cases.
- Tenant-isolation tests prove ids from another installation or PR are
  rejected before mutation.
- Retry tests prove one inline comment and at most one resolution reply per
  logical finding.
- End-to-end verification opens a known issue, fixes it in a later push, and
  confirms the summary transitions from open to resolved without duplication.
