# Schemas

Single source of shape truth for specs. Once code exists, `lib/db/schema.ts`
and the Zod files are authoritative — this file must be updated in the same
increment as any schema change. Shapes and enums only; no SQL dumps, no
unused webhook fields.

## Enums

```ts
ReviewStatus = "queued" | "running" | "completed" | "failed" | "skipped"
SkipReason   = "draft" | "bot_author" | "skip_keyword" | "daily_cap"
             | "rate_limited" | "stale_sha"
Severity     = "critical" | "high" | "medium" | "low" | "info"
Category     = "security" | "bug" | "quality" | "performance"
Verdict      = "approve" | "comment" | "concerns"
```

## Database (Drizzle / Postgres)

### installations

```ts
id               bigint PK            // GitHub installation_id (native id)
account_login    text NOT NULL        // org or user login
account_type     text NOT NULL        // "Organization" | "User"
model            text NOT NULL DEFAULT '<cheap default>'  // AI SDK model string
suspended        boolean NOT NULL DEFAULT false
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()
```

### repositories

```ts
id               bigint PK            // GitHub repo id (native id)
installation_id  bigint NOT NULL FK -> installations.id
full_name        text NOT NULL        // "owner/repo"
enabled          boolean NOT NULL DEFAULT true
created_at       timestamptz NOT NULL DEFAULT now()
```

### reviews

```ts
id               uuid PK DEFAULT gen_random_uuid()
installation_id  bigint NOT NULL FK   // denormalized for tenant filtering
repository_id    bigint NOT NULL FK -> repositories.id
pr_number        integer NOT NULL
head_sha         text NOT NULL        // 40-char SHA
status           ReviewStatus NOT NULL DEFAULT 'queued'
skip_reason      SkipReason NULL
verdict          Verdict NULL
review_markdown  text NULL            // rendered comment body (never the diff)
comment_id       bigint NULL          // GitHub comment id for edit-in-place
findings_critical integer NOT NULL DEFAULT 0
findings_high     integer NOT NULL DEFAULT 0
findings_medium   integer NOT NULL DEFAULT 0
findings_low      integer NOT NULL DEFAULT 0
findings_info     integer NOT NULL DEFAULT 0
skipped_files    text[] NOT NULL DEFAULT '{}'  // over-budget disclosure
model            text NULL
input_tokens     integer NULL
output_tokens    integer NULL
duration_ms      integer NULL
error            text NULL
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()

UNIQUE (repository_id, pr_number, head_sha)   // idempotency key
INDEX  (installation_id, created_at)          // dashboard + daily cap
```

Usage/caps are derived: `count(reviews) where installation_id = X and
created_at >= start_of_day and status != 'skipped'`.

## LLM Output Contract (Zod — `lib/review/schema.ts`)

```ts
Finding = {
  severity:   Severity
  category:   Category
  file:       string          // path as it appears in the diff
  line:       number | null   // null = file-level finding; never guess
  title:      string          // short, one line
  detail:     string          // explanation, plain language
  suggestion: string | null   // concrete fix if applicable
}

ReviewOutput = {
  summary:  string            // 1–3 sentences, plain language
  verdict:  Verdict
  findings: Finding[]         // may be empty
}
```

Rules: `generateObject` with this schema; on Zod failure retry once with
the validation error appended; on second failure → status `failed`, no
comment posted. Severity counts roll up into `reviews.findings_*` columns.

## Webhook Boundary (Zod — validated after HMAC verification)

Only the fields actually used are validated/typed; everything else in
GitHub's payload is ignored.

```ts
PullRequestEvent = {
  action: "opened" | "synchronize" | "ready_for_review" | string
  installation: { id: number }
  repository:   { id: number, full_name: string }
  pull_request: {
    number: number
    draft: boolean
    title: string
    body: string | null
    head: { sha: string }
    user: { login: string, type: "User" | "Bot" | string }
  }
}

InstallationEvent = {
  action: "created" | "deleted" | "suspend" | "unsuspend" | string
  installation: {
    id: number
    account: { login: string, type: string }
  }
  repositories?: { id: number, full_name: string }[]  // on created
}

InstallationRepositoriesEvent = {
  action: "added" | "removed"
  installation:         { id: number }
  repositories_added:   { id: number, full_name: string }[]
  repositories_removed: { id: number, full_name: string }[]
}
```

## QStash Job Payload (Zod — `lib/review/job.ts`)

Enqueued by the webhook route with ~60–90s delay (debounce); verified and
validated by the worker.

```ts
ReviewJob = {
  installationId: number
  repositoryId:   number
  repoFullName:   string
  prNumber:       number
  prTitle:        string
  prBody:         string | null
  headSha:        string   // worker exits early if no longer PR head
  deliveryId:     string   // GitHub X-GitHub-Delivery, for tracing
}
```

## Prompt Context Assembly (shape, not schema)

Built by `lib/review/prompt.ts` from:

```ts
PromptContext = {
  prTitle:       string
  prBody:        string | null
  fileTree:      string[]        // changed paths after filtering
  diff:          string          // filtered + prioritized, token-budgeted
  instructions:  string | null   // .aireview.md or AGENTS.md, <=~2k tokens,
                                 // delimited untrusted, add-only
  skippedFiles:  string[]        // disclosed in rendered comment
}
```

Filtering order: exclude lockfiles/generated/binary → rank by risk
(auth/api/middleware/db first; tests/docs last) → fill ~50–60k token
budget → remainder goes to `skippedFiles`.
