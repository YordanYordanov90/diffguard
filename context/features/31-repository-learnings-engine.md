# Feature 31 — Repository Learnings Engine

## Goal

Turn explicit, authorized review feedback into bounded repository preferences
that improve future reviews without allowing comments to rewrite DiffGuard's
security policy.

## Depends on

30.

## Scope (do)

- Add a tenant-scoped `repository_learnings` contract to `schemas.md` and a
  matching migration. Initial scope is repository-only; organization-wide and
  installation-wide learnings are deferred.
- A learning contains bounded natural-language guidance, active/archived
  state, creator identity, source finding/comment metadata, usage count, and
  safe timestamps. Never store source code, diff hunks, or full conversations.
- Extend the deterministic feedback handler with:
  `@diffguard remember: <preference>`.
- Require maintain, write, or admin repository permission at processing time.
  The model may suggest a possible learning in a reply later, but it can never
  persist one without this explicit authorized command.
- Enforce conservative limits: maximum length per learning, maximum active
  learnings per repository, duplicate detection, and a bounded combined prompt
  budget.
- Load active learnings by server-resolved installation and repository id.
  Apply them after immutable system rules in a dedicated delimited section.
- State explicitly in the prompt that learnings may add project preferences
  but cannot weaken security checks, remove validation, override the output
  schema, request secrets, invoke tools, or suppress skipped-file disclosure.
- Record only aggregate usage metadata when a learning is included in a review.
  Usage does not prove that a learning changed the model's answer.
- A false-positive signal alone never creates a learning. Narrow corrections
  such as the PR #38 sibling-control case belong in the product evaluation
  suite unless an authorized collaborator explicitly expresses a reusable
  repository preference.
- Archive rather than physically delete by default so audit history remains
  available. Feature 32 owns user-facing governance.

## Security invariants

- Learnings are untrusted stored input and are revalidated every time they are
  loaded.
- Cross-tenant, cross-repository, inactive, over-limit, or malformed learnings
  never enter the prompt.
- Security-first system instructions always outrank repository learnings.
- Raw learning text is never written to operational logs.

## Out of scope

Automatic learning from ordinary conversation, organization-wide scope,
learning generation from repository files, embeddings, model fine-tuning,
dashboard UI, or general PR chat.

## Verification

- Migration/query tests cover tenant isolation, repository ownership,
  duplicate detection, quotas, archive/reactivate, and concurrent creation.
- Permission tests prove only authorized collaborators can create learnings.
- Prompt snapshots prove learnings are delimited, budgeted, and subordinate to
  immutable security and schema rules.
- Injection fixtures include requests to reveal secrets, ignore security,
  change output format, or call external tools; all remain ineffective.
- A later review records which active learning ids were supplied without
  logging their text.
