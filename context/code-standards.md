# Code Standards

## General

- Keep modules small and single-purpose; fix root causes, not symptoms.
- The review core (`lib/review/`) stays pure: string/object in,
  string/object out, no fetch/DB calls — so it is trivially unit-tested.
- Do not mix boundaries: webhook handling, job execution, GitHub API
  access, and rendering live in their own modules.

## TypeScript

- Strict mode throughout; no `any`. Use narrow types and Zod-inferred
  types (`z.infer<>`) at boundaries.
- All external input (webhook payloads, QStash job bodies, LLM output,
  repo instruction files) is validated with Zod before use. Signature
  verification proves origin; Zod proves shape.
- Enums (`status`, `severity`, `category`, `verdict`) are defined once
  in `schemas.md`-mirrored code and imported — never re-declared inline.

## Next.js

- Default to server components; `use client` only where interactivity
  requires it (mobile navigation, dashboard polling, repository search,
  and the review detail sheet). Keep client boundaries leaf-level.
- Route handlers do one job each. Webhook route: verify → validate →
  rate-limit → enqueue → respond. Worker route: verify → idempotency →
  pipeline → persist.
- Worker route exports `maxDuration = 300`; the LLM call uses an
  AbortController with a ~120s budget.

## Security

- Timing-safe comparison for the GitHub HMAC signature; verify before
  reading the body into any logic.
- Verify QStash request signatures on the worker route.
- GitHub App private keys only in env vars (base64), different key per
  environment; never in the repo or context files.
- Never log diffs, tokens, or secrets. Log IDs, statuses, durations.
- Installation tokens are minted per job and never persisted.
- Repo instruction file content is wrapped in explicit delimiters and
  treated as untrusted (prompt-injection surface).

## API Routes

- Validate and parse input before any logic runs.
- Return the single project envelope on all JSON routes:
  `{ success, data, error }` with correct status codes (matches AGENTS.md).
- Webhook route always returns quickly (< a few seconds); never awaits
  the LLM.

## Data and Storage

- Metadata and rendered review markdown belong in Postgres.
- Diffs and file contents are never persisted (see invariants).
- Migrations via Drizzle Kit; a schema change and its `schemas.md`
  update land in the same increment.
- Usage/caps are derived by counting `reviews` rows — no separate
  counter table to keep consistent.
- Dashboard totals and repository coverage are derived from installations,
  repositories, and reviews. Do not persist presentation-only counters.
- Every dashboard query accepts the GitHub-derived installation allowlist
  server-side and filters on it. Never accept tenant scope from the client.

## Testing

- Vitest for the pure core: diff filtering, prioritization, prompt
  building, markdown rendering, Zod schemas.
- Captured webhook payloads saved as fixtures under `tests/fixtures/`
  and used as test inputs.
- Pipeline verification happens on the dev deployment via GitHub's
  webhook redelivery + Vercel logs + the dashboard.
- Dashboard tests cover authorization filtering, derived status/count
  formatting, navigation accessibility, and directed empty/error states.

## File Organization

- `app/api/webhooks/github/` — webhook receiver route
- `app/api/jobs/review/` — QStash worker route
- `app/(dashboard)/` — dashboard routes and shared server-rendered shell
- `components/dashboard/` — dashboard navigation, coverage, tables, and
  leaf-level client interactions
- `lib/dashboard/` — serializable read models and pure presentation mapping
- `lib/github/` — App auth, diff fetch, comment upsert, access checks
- `lib/review/` — pure review core (filter, prompt, schema, render)
- `lib/db/` — Drizzle schema, client, queries
- `lib/config/` — env validation, limits/caps constants, `getModel()`
- `tests/` — Vitest unit tests and webhook fixtures
