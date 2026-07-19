# Architecture Context

## Stack

| Layer      | Technology                          | Role                                          |
| ---------- | ----------------------------------- | --------------------------------------------- |
| Framework  | Next.js (App Router) + TypeScript   | Webhook route, worker route, dashboard        |
| UI         | Tailwind CSS + shadcn/ui            | Minimal read-only dashboard                   |
| Auth       | Clerk (GitHub OAuth only)           | Dashboard sign-in; GitHub identity source     |
| Database   | Neon Postgres + Drizzle ORM         | Installations, repos, reviews (metadata only) |
| Queue      | Upstash QStash                      | Debounced, retried review jobs                |
| Rate limit | Upstash Redis (@upstash/ratelimit)  | Per-installation webhook rate limiting        |
| AI         | Vercel AI SDK (`generateObject`)    | Provider-agnostic structured review output    |
| GitHub     | GitHub App (Octokit)                | Webhooks in; diffs + comments via API         |
| Hosting    | Vercel                              | Single app, two projects/envs (dev, prod)     |

## System Boundaries

- `app/api/webhooks/github/` — receives GitHub webhooks. Verifies HMAC
  signature (timing-safe), validates payload shape with Zod, applies rate
  limit and skip rules, enqueues QStash job with delay (debounce).
  Responds fast; does no review work.
- `app/api/jobs/review/` — QStash worker callback. Verifies QStash
  signature, enforces idempotency and daily cap, runs the review pipeline,
  writes results, posts/edits the PR comment. `maxDuration = 300`.
- `app/(dashboard)/` — Clerk-gated read-only pages. Resolves accessible
  installations from GitHub at request time; reads `reviews` only.
- `lib/github/` — GitHub App auth (installation tokens), diff fetching,
  comment upsert, `/user/installations` access resolution.
- `lib/review/` — pure core: diff filtering/prioritization, prompt
  building, Zod output schema, markdown rendering. No I/O — unit-testable.
- `lib/db/` — Drizzle schema and queries. Every query on tenant data
  filters by `installation_id`.

## Storage Model

- **Neon Postgres**: installations, repositories, review records,
  structured findings metadata, and the rendered review markdown.
- **Never stored**: diffs, file contents, or any repository source code.
  Diffs are fetched from GitHub, processed in memory, and discarded.
- **Env secrets**: GitHub App private keys (base64 .pem, separate keys
  per environment), webhook secrets, QStash keys, LLM API keys.

## Auth and Access Model

- Dashboard sign-in: Clerk with GitHub OAuth as the only method.
- Authorization source of truth: GitHub. Accessible installations are
  derived per session from `GET /user/installations` using the user's
  OAuth token (short-lived cache allowed). No users table; no manual
  installation linking; `installation_id` is never trusted from any
  client-supplied parameter.
- GitHub API access: short-lived installation tokens minted per job from
  the App private key. No PATs anywhere.
- Both public endpoints (webhook, worker) require signature verification
  before any parsing or DB access.

## Invariants

1. Route handlers never do long-running review work; all review work
   goes through QStash to the worker route.
2. No diff or repository source code is ever written to the database
   or logs.
3. Every query touching tenant data filters by `installation_id`.
4. A review is idempotent on `(repository, pr_number, head_sha)`:
   re-delivery or retry of a completed review exits cleanly and never
   double-posts or double-counts.
5. Malformed or schema-invalid LLM output is never posted to a PR
   (one retry, then fail silently with status `failed`).
6. Webhook and worker payloads are Zod-validated at the boundary even
   after signature verification.
7. Repo-provided instruction files are injected as delimited untrusted
   content that may only add review criteria — never override system
   rules or the output schema.
8. Model/provider selection is read from installation config through a
   single `getModel()` function; no hardcoded model strings in the
   pipeline.
