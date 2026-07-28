# Feature 32 — Learnings Governance Dashboard

## Goal

Make every stored repository learning visible, attributable, editable, and
reversible to authorized dashboard users.

## Depends on

16, 18, 20, 21, 31.

## Scope (do)

- Add a live `Learnings` dashboard destination only when this feature ships.
  Update `ui-context.md` in the same increment.
- Group learnings by accessible installation and repository. Show preference
  text, status, creator, source PR/finding link when available, created date,
  last-used date, and usage count.
- Add server actions for editing bounded text, archiving, and reactivating.
  Every action returns `{ success, data, error }`.
- Resolve the installation allowlist from the signed-in Clerk user through
  GitHub exactly as existing dashboard reads do. Never accept tenant scope from
  route params, form values, or client state.
- Re-check current GitHub repository permission for mutations. Dashboard
  visibility alone does not authorize modification.
- Use one confirmation step for archive/reactivate and clearly explain that an
  archived learning stops affecting future reviews.
- Keep the page operational and compact: repository filter, status filter, and
  text search are sufficient. Do not add generic analytics cards or charts.
- Display safe mutation errors only. Raw database, GitHub, provider, or stack
  errors stay server-side and contain no stored learning text in logs.
- Preserve a minimal audit trail of who changed status or text and when.

## Security invariants

- Server actions authenticate, resolve tenant access, validate the learning id
  belongs to that tenant/repository, validate input with Zod, and then mutate.
- Editing cannot change repository ownership, creator identity, usage
  metadata, or source linkage.
- Learning text is rendered as plain text, never raw HTML or executable
  Markdown.

## Out of scope

Creating installation-wide policies, billing, analytics dashboards, automatic
learning generation, deleting audit history, or general AI chat.

## Verification

- Access tests prove a user cannot view or mutate another installation's
  learning by changing ids or form payloads.
- Mutation tests cover stale access, insufficient GitHub permission, invalid
  text, archive/reactivate idempotency, and the standard response envelope.
- UI checks cover empty, active, archived, filtered, loading, and safe-error
  states at 320px, tablet, and desktop widths.
- Keyboard focus, accessible labels, status text, and confirmation behavior
  meet the existing dashboard accessibility contract.
