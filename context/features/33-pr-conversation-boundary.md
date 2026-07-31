# Feature 33 — PR Conversation Boundary

## Goal

Create a secure, rate-limited GitHub comment boundary for the final
PR-scoped AI conversation feature without yet answering questions with an LLM.

## Depends on

29, 30, 31, 32.

## Permission gate

- Top-level PR conversation uses GitHub issue comments. It requires the
  `issue_comment` webhook (`Issues: read`) and posting replies requires
  `Issues: write`.
- Update the GitHub App permission only when this feature begins. Existing
  installations must approve the change before chat is considered available.
- If permission is missing, automatic PR reviews continue unchanged and the
  dashboard shows chat as unavailable for that installation.
- GitHub documents that an App needs at least `Issues: read` to subscribe to
  `issue_comment`:
  <https://docs.github.com/en/webhooks/webhook-events-and-payloads>.

## Scope (do)

- Add the minimal Zod schema for created `issue_comment` events and confirm the
  issue is a pull request before processing.
- Recognize only comments that begin with an explicit `@diffguard` mention.
  Ignore edits, deletes, bot authors, DiffGuard's own comments, and unrelated
  mentions.
- Verify actor eligibility at processing time. Allow a current collaborator or
  the current PR author; webhook actor and PR-author fields are checked against
  the current GitHub comment and PR authors before authorization.
- Apply separate per-installation, per-PR, and per-actor rate limits plus a
  hard daily conversation cap independent of automatic review allowance; cap
  reservation is serialized per installation with the queue insert.
- Create a small signed QStash conversation job keyed idempotently by GitHub
  comment id. The webhook verifies, validates, queues, and returns quickly. A
  queued interaction is republished on redelivery after a publish failure.
- Add a conversation worker route that verifies QStash before parsing, checks
  the PR is still accessible, and exits safely for stale/deleted comments.
- Persist only operational interaction metadata: tenant/repository/PR,
  source comment id, status, model, token counts, duration, and safe error.
  The question and answer remain on GitHub and are not copied into Postgres.
- Fetch any bounded thread context from GitHub at execution time and discard it
  after the request.

## Security invariants

- PR comments and conversation history are untrusted prompt-injection input.
- The conversation worker has no branch-write, commit, deployment, secret,
  shell, or arbitrary tool capability.
- No diff, source content, question text, answer text, prompt, token, or secret
  is logged or persisted.
- Authorization is rechecked server-side; webhook authorship fields alone are
  not trusted.

## Out of scope

LLM answers, review controls, code generation, commits, pull requests,
dashboard chat, long-term conversation memory, or cross-repository questions.

## Verification

- Route tests cover signature-before-parse ordering, Zod validation, bot-loop
  prevention, PR detection, authorization, caps, and idempotent delivery.
- Worker tests cover QStash verification, deleted comments, closed/inaccessible
  PRs, safe failure envelopes, exclusive claims, retryable failed attempts, and
  current-author mismatches.
- Concurrency tests or database verification confirm that a daily-cap burst
  cannot reserve more than the configured installation allowance.
- Permission rollout is tested on the scratch installation before beta users
  are asked to approve it.
- Database/log inspection confirms no conversation text or repository source
  was stored.
