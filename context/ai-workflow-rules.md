# AI Workflow Rules

## Approach

Build DiffGuard incrementally using a spec-driven workflow. The seven
context files define what to build (`project-overview.md`), how to build
it (`architecture.md`, `code-standards.md`, `schemas.md`, `ui-context.md`),
and the current state (`progress-tracker.md`). Always implement against
these specs — do not infer or invent behavior, fields, or enums that are
not defined here.

## Scoping Rules

- Work on one feature unit at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single step.

## When to Split Work

Split an implementation step if it combines:

- Webhook/queue changes and worker pipeline changes
- Pipeline changes and dashboard UI changes
- Schema/migration changes and feature logic beyond wiring the new field
- Behavior not clearly defined in the context files

If a change cannot be verified end to end quickly (unit test for pure
core, or one webhook redelivery for pipeline), the scope is too broad —
split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context
  file before implementing.
- If a requirement is missing, add it as an open question in
  `progress-tracker.md` before continuing.

## Protected Files

Do not modify unless explicitly instructed:

- `components/ui/*` — shadcn/ui generated components
- Any third-party library internals
- `.env*` values (structure may be documented; secrets never written)

## Keeping Docs in Sync

Update the relevant context file in the same increment whenever
implementation changes:

- System architecture or boundaries → `architecture.md`
- Any Drizzle migration, Zod schema, enum, or payload shape →
  `schemas.md` (code is source of truth; a stale `schemas.md` is a bug)
- Conventions or standards → `code-standards.md`
- Feature scope → `project-overview.md`
- Progress, decisions, open questions → `progress-tracker.md`

## Security Checks Per Increment

Before completing any unit that touches a boundary, confirm:

- No diff/source content persisted or logged
- Signature verification precedes parsing on public endpoints
- New queries on tenant data filter by `installation_id`
- New external input has a Zod schema in `schemas.md`

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant in `architecture.md` was violated.
3. `progress-tracker.md` reflects the completed work.
4. `npm run build` passes.
5. Vitest passes for any touched pure-core module.
