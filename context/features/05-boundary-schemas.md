# Feature 05 — Zod Boundary Schemas (`lib/review/schema.ts`, `lib/github/events.ts`)

## Goal
Runtime validation for every external shape, mirroring `context/schemas.md`.

## Depends on
01 (pure code — parallel to 03/04).

## Scope (do)
- PullRequestEvent, InstallationEvent, InstallationRepositoriesEvent
  (only the fields listed in schemas.md; passthrough-ignore the rest).
- ReviewJob (QStash payload).
- ReviewOutput + Finding (the LLM contract) with enums Severity, Category,
  Verdict — single definition, exported types via z.infer.
- SHA format check (40 hex chars) on head_sha fields.

## Out of scope
Any route or network code. Prompt building. Rendering.

## Verification
Unit tests: valid fixtures parse; missing/malformed fields fail; enum
values outside the set fail. These schemas are imported everywhere else —
never re-declared.
