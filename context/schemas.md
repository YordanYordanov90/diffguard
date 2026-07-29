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
ReviewMode   = "full" | "incremental" | "fallback_full"
Severity     = "critical" | "high" | "medium" | "low" | "info"
Category     = "security" | "bug" | "quality" | "performance"
Verdict      = "approve" | "comment" | "concerns"
FindingConfidence = "low" | "medium" | "high"
FindingDecision   = "confirmed" | "rejected" | "manual_verification"
FindingLifecycle  = "open" | "resolved" | "dismissed"
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
review_mode      ReviewMode NOT NULL DEFAULT 'full'
compared_from_sha text NULL            // prior completed head for incremental
review_markdown  text NULL            // rendered comment body (never the diff)
comment_id       bigint NULL          // GitHub comment id for edit-in-place
findings_critical integer NOT NULL DEFAULT 0
findings_high     integer NOT NULL DEFAULT 0
findings_medium   integer NOT NULL DEFAULT 0
findings_low      integer NOT NULL DEFAULT 0
findings_info     integer NOT NULL DEFAULT 0
candidate_findings       integer NOT NULL DEFAULT 0
rejected_findings        integer NOT NULL DEFAULT 0
manual_check_candidates  integer NOT NULL DEFAULT 0
adjudication_model       text NULL
adjudication_duration_ms integer NULL
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

`compared_from_sha`, like `head_sha`, is a 40-character hexadecimal SHA when
set. Review mode does not change the idempotency key.

Usage/caps are derived: `count(reviews) where installation_id = X and
created_at >= start_of_day and status != 'skipped'`.

### review_findings (Feature 25)

```ts
id                    uuid PK DEFAULT gen_random_uuid()
installation_id       bigint NOT NULL FK -> installations.id (cascade)
repository_id         bigint NOT NULL FK -> repositories.id (cascade)
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

Every query filters by `installation_id`. Only Feature 24 `confirmed`
candidates become rows. Fingerprints are computed in trusted pure code from
normalized category/file/line/violated-invariant plus a one-way hash of
normalized observed-behavior and causal-path. Invalid line locations degrade
to file-level findings before persistence. `suggested_change` is revalidated
at the write boundary and again against the reviewed patch before any GitHub
suggestion block is rendered (Feature 26). Upserts never overwrite an existing
`github_comment_id` and never silently reopen `dismissed` findings.

### Inline review comments (Feature 26 — runtime, not a table)

```ts
PullRequestReviewCommentInput = {
  path: string
  body: string
  line: number              // RIGHT-side new-file line; never `position`
  side: "RIGHT" | "LEFT"
  startLine?: number        // multi-line comments / suggestion ranges
  startSide?: "RIGHT" | "LEFT"
}

CreatePullRequestReviewResult = {
  reviewId: number
}

CreatedPullRequestReviewComment = {
  id: number
  path: string
  line: number | null
  startLine: number | null
  body: string
}
```

Eligibility (pure): confidence `high`; severity critical/high, or medium under
the remaining cap; mapped added line; max 8 ordered by security → severity →
file risk. `event` is always `COMMENT`. Suggestion blocks require a validated
`SuggestedChange` fully inside one hunk.

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

SuggestedChange = {
  startLine:   number
  endLine:     number
  replacement: string
}

FindingCandidate = Finding & {
  confidence:                  FindingConfidence
  observedBehavior:            string
  causalPath:                  string
  violatedInvariant:           string
  requiresRuntimeVerification: boolean
  suggestedChange:             SuggestedChange | null
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

ConfirmedFinding = FindingCandidate & {
  requiresRuntimeVerification: false
}
```

Rules: `generateObject` with these schemas; on Zod failure each structured
call retries once with the validation error appended. The first call produces
candidates; trusted code validates their file and changed line against the
parsed diff and assigns candidate ids. The independent second call receives
only allowlisted candidates and delimited evidence. Only `confirmed`
candidates become the publishable `ReviewOutput` and durable
`review_findings` rows; rejected and manual-verification candidates never
affect counts, output, or finding persistence. Malformed, missing, duplicate,
or arbitrary adjudication ids confirm nothing for the affected candidate.
Fingerprints are never accepted from the LLM.

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
  changedFileContext: {
    file: string
    content: string
  }[]                          // bounded exact-head context, delimited untrusted
  relatedCodeContext: {
    file: string
    reason: string
    content: string
  }[]                          // one-hop exact-head context, delimited untrusted
}
```

Filtering order: exclude lockfiles/generated/binary → rank by risk
(auth/api/middleware/db first; tests/docs last) → fill ~50–60k token
budget → remainder goes to `skippedFiles`.

Feature 22 reserves a combined `REVIEW_PROMPT_TOKEN_BUDGET` for the diff,
repository instructions, prompt structure, and bounded changed-file context.
The worker estimates the assembled base prompt before retrieval and gives only
the remaining token/byte capacity to full-file context. After retrieval, the
final prompt is re-estimated and trailing context files are removed if prompt
formatting overhead would exceed the combined budget.

Feature 23 plans only one-hop local imports and conventionally colocated tests
from a validated exact-head repository tree. Related candidates are
deduplicated against changed/full-file context, ranked deterministically, and
share the full-file byte, token, request, and timeout budgets. Related context
is labeled with a trusted selection reason inside its own untrusted prompt
section. Repository-tree status and related fetch counts are runtime-only
aggregate metadata; paths, search results, prompts, and source content are
never persisted.

---

## Planned Review-Quality Contracts

The remaining contracts below belong to Features 28–34 and are **not implemented yet**
(Features 25–27 finding rows, fingerprints, inline review comments, and incremental
review baselines are
implemented above). They are the shape source of truth when each numbered feature
begins. Move each contract into the implemented sections above, and update the
matching Zod/Drizzle code in the same increment.

### Planned enums

```ts
FeedbackAction    = "valid" | "dismiss" | "false_positive"
LearningStatus    = "active" | "archived"
IssueAssessmentStatus = "addressed" | "not_addressed" | "unclear"
InteractionStatus = "queued" | "running" | "completed" | "failed" | "skipped"
```

### Planned reviews additions (Feature 29)

```ts
linked_issue_assessments jsonb NOT NULL DEFAULT "[]"
```

The JSON column is validated as `IssueAssessment[]` before every write and
after every read.

### Review job (QStash — Feature 27 addition)

```ts
// existing fields plus:
forceFullReview?: boolean  // internal override for Feature 34; default false
```

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

### Planned structured LLM contracts (Features 25–29 and 34)

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

### Planned prompt context additions (Features 24 and 28–31)

```ts
PromptContextV2 = PromptContext & {
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

Feature 22 fetch metadata is runtime-only and aggregate-only. A repository file
fetch may be `fetched`, `missing`, `unsupported`, `oversized`, or `truncated`;
malformed or truncated content is never supplied to the prompt. Source content
and file paths are not persisted in this metadata.

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
