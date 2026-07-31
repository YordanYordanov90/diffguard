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
- `app/api/jobs/feedback/` — QStash worker for Feature 30 collaborator
  feedback. Verifies QStash signature, re-checks actor permission via GitHub,
  records tenant-scoped feedback, dismisses findings when authorized, and
  posts a short acknowledgement. `maxDuration = 60`.
- `app/api/jobs/conversation/` — QStash worker for Feature 33 PR conversation
  boundary. Verifies QStash, re-checks actor permission, confirms PR and
  source comment accessibility, loads ephemeral thread context (discarded),
  and records operational interaction metadata only. Feature 34 will add LLM
  answers. `maxDuration = 60`.
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
- Feature 24 treats the first structured result as evidence-bearing candidate
  findings. Trusted code assigns allowlisted ids and validates candidate paths
  and added lines against the reviewed diff. A separate no-tool adjudication
  call receives only delimited candidates, relevant hunks, and selected
  context; only confirmed candidates reach rendering and severity counts.
  Generation and adjudication share one total LLM deadline, while
  adjudication has a bounded output-token budget. Timeout or malformed
  adjudication fails closed by suppressing unverified candidates. Review rows
  store only aggregate candidate/decision counts and adjudication model/time.
- Feature 27 selects a review baseline after the job is claimed: look up the
  latest completed review for the same installation/repository/PR, confirm
  via GitHub that its head is on the current PR and a pure ancestor of the
  validated job head, then fetch either the previous…head range diff or the
  full PR diff. Mode (`full` | `incremental` | `fallback_full`) and
  `compared_from_sha` are stored on the review row and disclosed in the
  summary footer. An internal `forceFullReview` job flag (Feature 34) forces
  full mode. Stale-head is checked at claim time and again immediately
  before publication.
- Feature 25 persists one durable finding row per repository, PR, and trusted
  fingerprint for confirmed candidates only. Fingerprints are computed in pure
  code from normalized semantics plus a one-way evidence anchor; retries upsert
  without duplicating rows or overwriting existing GitHub comment ids.
  Dismissed findings never silently reopen. Diffs, prompts, and source content
  remain non-persisted.
- Feature 26 posts at most eight high-confidence inline review comments in one
  GitHub `COMMENT` review (never APPROVE/REQUEST_CHANGES) using `line`/`side`
  coordinates on a head SHA rechecked immediately before publication.
  Suggested-change blocks are included only when the replacement range is
  fully contained in one reviewed hunk and contains the confirmed finding line.
  Non-stale inline failure degrades to summary-only; the edit-in-place summary
  remains canonical. A stale head skips all publication under Feature 27's
  pre-publication guard. After GitHub accepts the review POST, comment-ID
  retrieval retries only its safe GET and never posts a duplicate review.
  Returned review-comment ids attach to Feature 25 finding rows once.
- Feature 28 loads open tenant/PR findings only for incremental reviews and
  supplies bounded, delimited prior model output for findings whose normalized
  file path is touched by the range. Only those trusted ids can be marked
  resolved; omitted, duplicate, or arbitrary ids preserve the finding as open.
  Reconciliation batches reopened confirmed fingerprints and resolution updates
  atomically, preserves the prior resolution SHA/timestamp on reopen, and never
  reopens dismissed findings. It renders new/still-open/resolved outcomes and
  acquires a tenant/PR-scoped reply lease before replying once to an existing
  inline thread; each attempt has a unique token and deterministic body marker,
  claimed rows cannot reopen until the lease is completed or released after a
  failed reply, and accepted reply ids are persisted for retry recovery. The
  head is rechecked before durable reconciliation writes and again before
  summary publication.
- Feature 29 parses only explicit PR-body closing references (`fixes` /
  `closes` / `resolves` + `#N` or same-repo issue URL), caps at three
  same-repository issues, and fetches each issue title/body in memory via the
  installation token. Missing `Issues: read`, private/inaccessible issues, and
  PR-as-issue references soft-fail to `unclear` so ordinary code review still
  completes. Issue text is bounded, delimited untrusted product context;
  assessments (`addressed` | `not_addressed` | `unclear`) are advisory only,
  allowlist-validated, rendered under **Linked requirements**, and persisted
  with minimal metadata (number, title, status, rationale, unmet list) — never
  the full issue body.
- Feature 30 subscribes to `pull_request_review_comment` events. After raw-body
  HMAC verification, only newly created human replies whose body parses as a
  deterministic `@diffguard` command are enqueued to a signed QStash feedback
  job. The worker resolves the parent comment only when it matches a tenant/
  repository/PR-scoped DiffGuard finding `github_comment_id`, re-checks the
  actor's current repository permission via GitHub (`valid`: PR author or any
  collaborator; `dismiss` / `false_positive`: write, maintain, or admin),
  inserts one `finding_feedback` row keyed by source comment id, and moves open
  findings to `dismissed` for dismiss and false-positive signals. `valid` never
  changes lifecycle. Acknowledgements are short replies that never expose
  internal ids, permission details, or raw API errors. Bot-authored events and
  free-form text are ignored. False-positive rows are offline golden-set
  candidates only — never automatic repository instructions.
- Feature 31 extends the same feedback path with
  `@diffguard remember: <preference>`. Write/maintain/admin permission is
  required. A tenant-scoped `repository_learnings` row stores bounded guidance,
  a trusted content hash for duplicates, optional source finding/comment ids,
  and active/archived status — never source code or thread history. Active
  learnings load by installation and repository id, are revalidated on every
  load, budgeted into a dedicated delimited untrusted prompt section after
  system rules, and cannot weaken security checks or override the output
  schema. Aggregate usage counters record which learning ids were supplied to
  a review; guidance text is never logged. Archive is soft; Feature 32 owns
  user-facing governance.
- Feature 32 adds `/dashboard/learnings` for authorized dashboard users.
  Reads filter by the GitHub-derived installation allowlist only. Server
  Actions edit guidance, archive, and reactivate after re-checking the actor's
  current repository write/maintain/admin permission via GitHub. Mutations
  never trust client-supplied installation or repository ids, return
  `{ success, data, error }`, and append a minimal audit row (actor, action,
  timestamp) without logging guidance text. Editing cannot change creator,
  usage counters, or source linkage. Learning text is rendered as plain text.
- Feature 33 subscribes to `issue_comment` (requires `Issues: read`; replies
  need `Issues: write`). After HMAC verification, only newly created human
  comments on pull-request issues that begin with `@diffguard` are enqueued.
  Separate per-installation, per-PR, and per-actor rate limits plus a daily
  conversation cap (independent of review caps) apply before queueing. The
  worker re-checks collaborator/PR-author eligibility, skips deleted comments
  and inaccessible PRs, fetches a bounded comment thread into memory only,
  and completes without an LLM answer. `pr_interactions` stores only
  operational metadata keyed by source comment id — never question/answer
  text, diffs, or prompts.
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
4a. Incremental reviews use only a server-resolved previous completed head
    for the same tenant/repository/PR. Previous SHAs are never taken from
    webhooks or clients. Comparison failures, rewritten history, truncated
    GitHub comparisons, or missing bases always broaden to the full PR diff
    (`fallback_full`). Diffs are never persisted either way.
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
