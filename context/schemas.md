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

## GitHub App OAuth Contracts (Zod — `lib/auth/github-app.ts`)

The one-time dashboard authorization flow stores only encrypted token data in
Redis. GitHub's token exchange response is validated before anything is saved:

```ts
GitHubAppTokenExchange = {
  access_token: string
  token_type: "bearer"
  scope: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
}

PendingGitHubOAuthState = {
  userId: string       // Clerk user id
  returnTo: string     // local application path only
}
```

OAuth state is single-use and expires after ten minutes. Access and refresh
tokens are AES-256-GCM encrypted before being written to Upstash Redis under a
Clerk-user-scoped key; raw tokens are never logged or sent to the client.

## Dashboard GitHub Access Contract

`GET /user/installations` is external input and is reduced to this validated
shape before authorization or display:

```ts
AccessibleInstallation = {
  id: number
  account: {
    login: string
    type: string
  }
  repository_selection: "all" | "selected"
  html_url: string                 // HTTPS URL with exact github.com origin
  suspended_at: string | null
}
```

The server derives the dashboard installation-id allowlist from
`AccessibleInstallation[]`. The descriptor cache is keyed by Clerk user id
and remains server-only. `html_url` is accepted only when its parsed origin is
exactly `https://github.com` and is used only for the explicit
`Manage on GitHub` action. Repository rows and latest-review metadata are
derived from existing database tables; no new persisted dashboard schema is
introduced for Features 18–20.

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

---

## Planned Review-Quality Contracts

The contracts below belong to Features 22–34 and are **not implemented yet**.
They are the shape source of truth when each numbered feature begins. Move
each contract into the implemented sections above, and update the matching
Zod/Drizzle code in the same increment.

### Planned enums

```ts
ReviewMode       = "full" | "incremental" | "fallback_full"
FindingConfidence = "low" | "medium" | "high"
FindingDecision   = "confirmed" | "rejected" | "manual_verification"
FindingLifecycle  = "open" | "resolved" | "dismissed"
FeedbackAction    = "valid" | "dismiss" | "false_positive"
LearningStatus    = "active" | "archived"
IssueAssessmentStatus = "addressed" | "not_addressed" | "unclear"
InteractionStatus = "queued" | "running" | "completed" | "failed" | "skipped"
```

### Planned reviews additions (Features 24, 27, and 29)

```ts
review_mode              ReviewMode NOT NULL DEFAULT "full"
compared_from_sha        text NULL       // prior completed head for incremental
linked_issue_assessments jsonb NOT NULL DEFAULT "[]"
candidate_findings       integer NOT NULL DEFAULT 0
rejected_findings        integer NOT NULL DEFAULT 0
manual_check_candidates  integer NOT NULL DEFAULT 0
adjudication_model       text NULL
adjudication_duration_ms integer NULL
```

`compared_from_sha`, like `head_sha`, is a 40-character hexadecimal SHA.
The JSON column is validated as `IssueAssessment[]` before every write and
after every read.

### review_findings (Feature 25)

```ts
id                    uuid PK DEFAULT gen_random_uuid()
installation_id       bigint NOT NULL FK
repository_id         bigint NOT NULL FK -> repositories.id
pr_number             integer NOT NULL
fingerprint           text NOT NULL       // trusted SHA-256, no source text
status                FindingLifecycle NOT NULL DEFAULT "open"
confidence            FindingConfidence NOT NULL
severity              Severity NOT NULL
category              Category NOT NULL
file                  text NOT NULL
line                  integer NULL
title                 text NOT NULL
detail                text NOT NULL
observed_behavior     text NOT NULL
causal_path           text NOT NULL
violated_invariant    text NOT NULL
suggestion            text NULL
suggested_change      jsonb NULL           // validated SuggestedChange
introduced_review_id  uuid NOT NULL FK -> reviews.id
last_review_id        uuid NOT NULL FK -> reviews.id
introduced_sha        text NOT NULL
last_seen_sha         text NOT NULL
resolved_sha          text NULL
github_comment_id     bigint NULL
resolution_replied_at timestamptz NULL
dismissed_at          timestamptz NULL
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()

UNIQUE (repository_id, pr_number, fingerprint)
INDEX  (installation_id, repository_id, pr_number, status)
```

Every query filters by `installation_id`. `suggested_change` is validated at
the database boundary and revalidated against the current diff before GitHub
publication.

### finding_feedback (Feature 30)

```ts
id                uuid PK DEFAULT gen_random_uuid()
installation_id   bigint NOT NULL FK
repository_id     bigint NOT NULL FK -> repositories.id
pr_number         integer NOT NULL
finding_id        uuid NOT NULL FK -> review_findings.id
source_comment_id bigint NOT NULL
actor_login       text NOT NULL
action            FeedbackAction NOT NULL
reason            text NULL
created_at        timestamptz NOT NULL DEFAULT now()

UNIQUE (source_comment_id)
INDEX  (installation_id, repository_id, pr_number)
```

`reason` is required and bounded for `dismiss` and `false_positive`; it is
null for `valid`.

### repository_learnings (Feature 31)

```ts
id                uuid PK DEFAULT gen_random_uuid()
installation_id   bigint NOT NULL FK
repository_id     bigint NOT NULL FK -> repositories.id
guidance          text NOT NULL
content_hash      text NOT NULL       // trusted normalized SHA-256
status            LearningStatus NOT NULL DEFAULT "active"
created_by        text NOT NULL
source_finding_id uuid NULL FK -> review_findings.id
source_comment_id bigint NULL
usage_count       integer NOT NULL DEFAULT 0
last_used_at      timestamptz NULL
archived_at       timestamptz NULL
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()

UNIQUE (repository_id, content_hash)
INDEX  (installation_id, repository_id, status)
```

Initial scope is repository-only. Guidance is bounded, stored as plain text,
and always treated as untrusted add-only prompt context.

### pr_interactions (Feature 33)

```ts
id                uuid PK DEFAULT gen_random_uuid()
installation_id   bigint NOT NULL FK
repository_id     bigint NOT NULL FK -> repositories.id
pr_number         integer NOT NULL
source_comment_id bigint NOT NULL
status            InteractionStatus NOT NULL DEFAULT "queued"
model             text NULL
input_tokens      integer NULL
output_tokens     integer NULL
duration_ms       integer NULL
error             text NULL
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()

UNIQUE (source_comment_id)
INDEX  (installation_id, created_at)
```

Question text, answer text, comment-thread content, diffs, and source files are
never persisted.

### pr_review_controls (Feature 34)

```ts
installation_id bigint NOT NULL FK
repository_id   bigint NOT NULL FK -> repositories.id
pr_number       integer NOT NULL
paused          boolean NOT NULL DEFAULT false
updated_by      text NOT NULL
updated_at      timestamptz NOT NULL DEFAULT now()

PRIMARY KEY (repository_id, pr_number)
INDEX (installation_id, repository_id, pr_number)
```

### Planned structured LLM contracts (Features 24–29 and 34)

```ts
SuggestedChange = {
  startLine:   number
  endLine:     number
  replacement: string
}

FindingCandidate = Finding & {
  confidence:                  FindingConfidence
  observedBehavior:           string
  causalPath:                 string
  violatedInvariant:          string
  requiresRuntimeVerification: boolean
  suggestedChange:            SuggestedChange | null
}

CandidateReviewOutput = {
  summary:    string
  verdict:    Verdict
  candidates: FindingCandidate[]
}

FindingAdjudication = {
  candidateId: string
  decision:    FindingDecision
  reason:      string
}

AdjudicationOutput = {
  summary:   string
  verdict:   Verdict
  decisions: FindingAdjudication[]
}

FindingV2 = FindingCandidate & {
  requiresRuntimeVerification: false
}

FindingUpdate = {
  findingId: string
  status:    "open" | "resolved"
  reason:    string
}

IssueAssessment = {
  issueNumber: number
  status:      IssueAssessmentStatus
  rationale:   string
  unmetRequirements: string[]
}

ReviewOutputV2 = {
  summary:          string
  verdict:          Verdict
  findings:         FindingV2[]
  findingUpdates:   FindingUpdate[]
  linkedIssues:     IssueAssessment[]
}

ChatResponse = {
  answer: string
  references: {
    file: string
    line: number | null
  }[]
}
```

Trusted code assigns candidate ids after candidate generation and assembles
`ReviewOutputV2` from confirmed candidates plus the adjudicated summary and
verdict. Candidate summary/verdict text is never published directly. All
strings and arrays receive explicit Zod length limits in the implementing
feature. Candidate ids, finding-update ids, and issue numbers are checked
against server-built allowlists after schema validation.

### Planned prompt context additions (Features 22–24 and 28–31)

```ts
PromptContextV2 = PromptContext & {
  changedFileContext: {
    file: string
    content: string
  }[]
  relatedCodeContext: {
    file: string
    reason: string
    content: string
  }[]
  findingsToReevaluate: {
    id: string
    file: string
    line: number | null
    title: string
    detail: string
  }[]
  linkedIssues: {
    issueNumber: number
    title: string
    body: string | null
  }[]
  repositoryLearnings: {
    id: string
    guidance: string
  }[]
}
```

Every content-bearing section is independently delimited and labeled
untrusted. Token budgets apply to the combined prompt, not independently in a
way that can exceed the configured LLM input limit.

### Planned webhook/job contracts (Features 30, 33, and 34)

```ts
ReviewCommentEvent = {
  action: "created" | string
  installation: { id: number }
  repository: { id: number, full_name: string }
  pull_request: { number: number }
  comment: {
    id: number
    body: string
    in_reply_to_id?: number
    user: { login: string, type: string }
  }
}

IssueCommentEvent = {
  action: "created" | string
  installation: { id: number }
  repository: { id: number, full_name: string }
  issue: {
    number: number
    pull_request?: { url: string }
  }
  comment: {
    id: number
    body: string
    user: { login: string, type: string }
    author_association: string
  }
}

FeedbackJob = {
  installationId: number
  repositoryId: number
  repoFullName: string
  prNumber: number
  commentId: number
  parentCommentId: number
  actorLogin: string
  deliveryId: string
}

ConversationJob = {
  installationId: number
  repositoryId: number
  repoFullName: string
  prNumber: number
  commentId: number
  actorLogin: string
  deliveryId: string
}
```

Webhook bodies remain verified before parsing. Jobs are generated only from
validated webhook payloads, then independently verified and Zod-validated at
their QStash worker boundaries.
