# Architecture Context

## Stack

| Layer      | Technology                          | Role                                          |
| ---------- | ----------------------------------- | --------------------------------------------- |
| Framework  | Next.js (App Router) + TypeScript   | Webhook route, worker route, dashboard        |
| UI         | Tailwind CSS + shadcn/ui            | Read-only operations workspace                |
| Auth       | Clerk (GitHub OAuth only)           | Dashboard sign-in; GitHub identity source     |
| Database   | Neon Postgres + Drizzle ORM         | Installations, repos, reviews (metadata only) |
| Queue      | Upstash QStash                      | Debounced, retried review jobs                |
| Rate limit | Upstash Redis (@upstash/ratelimit)  | Per-installation webhook rate limiting        |
| AI         | Vercel AI SDK (`generateObject`)    | Provider-agnostic structured review output    |
| GitHub     | GitHub App (Octokit)                | Webhooks in; diffs + comments via API         |
| Hosting    | Vercel                              | Single app/project with one shared environment |

## System Boundaries

- `app/api/webhooks/github/` — receives GitHub webhooks. Verifies HMAC
  signature (timing-safe), validates payload shape with Zod, applies rate
  limit and skip rules, enqueues QStash job with delay (debounce).
  Responds fast; does no review work.
- `app/api/jobs/review/` — QStash worker callback. Verifies QStash
  signature, enforces idempotency and daily cap, runs the review pipeline,
  writes results, posts/edits the PR comment. `maxDuration = 300`.
- `app/(dashboard)/` — Clerk-gated read-only workspace. Resolves accessible
  installations from GitHub at request time; reads tenant-scoped
  installations, repositories, and reviews.
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
- **Env secrets**: GitHub App private key (base64 .pem), webhook secret,
  QStash keys, and LLM API keys stored in the Vercel project's environment;
  promotion uses the same configured app and database rather than separate
  dev/prod secret sets.

## Auth and Access Model

- Dashboard sign-in: Clerk with GitHub OAuth as the only identity method.
- GitHub authorization: the DiffGuard GitHub App user OAuth flow is completed
  once after Clerk sign-in. Its user access/refresh tokens are encrypted in
  Upstash Redis, keyed by Clerk user id; access tokens refresh automatically.
- Authorization source of truth: GitHub. Accessible installation descriptors
  are derived per session from `GET /user/installations` using the DiffGuard
  GitHub App user access token (short-lived cache allowed). The validated
  result includes the installation id, account identity, repository selection
  mode, GitHub configuration URL, and suspension state. Server-side dashboard
  reads derive their installation-id allowlist from these descriptors.
- Repository-selection source of truth: GitHub. `All repositories` versus
  `Selected repositories` is displayed from GitHub's installation metadata.
  Changes open the validated GitHub installation `html_url`, restricted to
  the exact `https://github.com` origin; DiffGuard does not implement
  repository grant/revoke mutations.
- No users table; no manual installation linking; `installation_id` is never
  trusted from a URL, query string, form value, or client state.
- GitHub API access: short-lived installation tokens minted per job from
  the App private key. No PATs anywhere.
- Smart full-file context fetches use only server-validated 40-character head
  SHAs and repository-relative paths. Contents responses are strictly decoded,
  bounded by declared and decoded byte counts, and discarded as soft misses
  when missing, unsupported, malformed, oversized, or truncated.
- The worker estimates the base prompt before retrieval and reserves the
  remaining combined prompt budget for changed-file context; after retrieval,
  it re-estimates the final prompt and drops trailing context files when
  formatting overhead would exceed the combined budget.
- Feature 23 builds a pure one-hop planner from changed-file imports and
  conventionally colocated tests against a validated exact-head repository
  tree. It ignores aliases, dynamic imports, generated paths, ambiguous
  resolutions, and consumer search unless a future bounded search can prove a
  unique match; symlink entries are excluded. Related retrieval uses the same
  installation, head SHA, byte/token budget, request cap, and deadline as
  full-file context.
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
9. Every dashboard aggregate, installation, repository, and review read is
   filtered by the GitHub-derived installation allowlist.
10. Repository access changes happen on GitHub. DiffGuard may display and
    refresh access state but never grants itself access through dashboard
    controls.

## Dashboard Read Model

- The dashboard shell is server-rendered and shared by:
  `/dashboard`, `/dashboard/reviews`, and `/dashboard/repositories`.
  Only mobile navigation, polling, search, and detail-sheet interactions
  require client components.
- Overview data is derived from tenant-scoped installation, repository, and
  review queries. No summary counters are persisted.
- Repository coverage joins each authorized repository to its installation
  and latest review metadata. A repository without reviews is
  `Awaiting first review`; it is not treated as a failure.
- Repository-filtered review history confirms the repository belongs to the
  GitHub-derived installation allowlist before applying the filter.
- A manual repository refresh bypasses or invalidates the five-minute
  installation-access cache after the user changes access on GitHub.
