# Feature 34 — PR-Scoped AI Chat & Review Controls

## Goal

Let developers ask DiffGuard about the current PR and control its reviews from
GitHub, while keeping chat subordinate to the automatic security review.

## Depends on

22–33. This is the final feature in the review-quality roadmap.

## Scope (do)

- Support two interaction paths:
  - free-form PR questions such as `@diffguard explain the auth risk`;
  - deterministic review controls parsed before any LLM call.
- Initial review controls:
  - `@diffguard review` — incremental review of new changes;
  - `@diffguard full review` — full PR review at the current head;
  - `@diffguard pause` — stop automatic reviews for this PR;
  - `@diffguard resume` — resume automatic reviews.
- Require write/maintain/admin permission for pause, resume, full review, and
  normal review commands. The PR author may request any review command, while
  read-only collaborators may ask questions within rate limits.
- Add a tenant-scoped PR control record for paused state and audit metadata.
  The existing pull-request trigger checks this state before queueing; manual
  review commands still pass idempotency, daily-cap, and stale-head checks.
- Build each chat request from a bounded subset of:
  - the user's question;
  - current PR title/body and head SHA;
  - current DiffGuard findings and linked-issue assessment;
  - a short GitHub comment thread;
  - the relevant diff and smart context from Features 22–23.
- Use a structured response contract with a concise answer and validated
  file/line references. A reference not present in the supplied diff or
  finding context is removed rather than guessed. Finding context and the
  assembled chat prompt have hard aggregate bounds.
- Reply once to the source GitHub comment. Transient GitHub reply failures are
  retryable; confirmed non-retryable permission failures are terminal. State
  uncertainty plainly when the bounded context cannot support an answer.
- Route `remember`, `valid`, `dismiss`, and `false-positive` through Features
  30–31 rather than letting the conversational model mutate state.
- Track chat cost separately from automatic reviews so chat cannot consume or
  bypass the automatic-review budget.

## Security invariants

- The model is explanatory only. It cannot call tools, write code, create
  commits, open PRs, change permissions, expose secrets, or mutate findings.
- Deterministic commands are parsed and authorized outside the model. Model
  text can never synthesize a command or authorize its actor.
- User comments, PR text, issue text, learnings, previous bot replies, diffs,
  and source files are independently delimited as untrusted data.
- The immutable system prompt, output schema, tenant boundary, and
  security-first rules cannot be overridden by conversation.

## Out of scope

Dashboard chat, repository-wide assistant questions, cross-repository chat,
agentic tool use, branch writes, automatic fixes, stacked PRs, deployment
actions, or persistent conversational memory.

## Verification

- Command tests cover permission tiers, paused triggers, manual incremental and
  full reviews, caps, retries, stale heads, and duplicate comment delivery.
- Chat schema tests reject unsupported references, oversized answers, tool
  requests, hidden commands, and malformed model output.
- Adversarial tests cover prompt injection from every context source and prove
  no state mutation occurs through generated text.
- End-to-end verification asks about one real finding, requests a recheck,
  pauses/resumes a PR, and confirms exactly one reply/action per command.
