# Feature 22 — Smart Full-File Context

## Goal

Reduce false positives by giving the reviewer bounded full-file context for
the most important changed files, without storing repository source or turning
the worker into a repository crawler.

## Depends on

06, 10, 11, 13, 14.

## Scope (do)

- Add a pure context-selection step after diff filtering and prioritization.
  It selects changed files that need more context because they are
  security-sensitive, contain incomplete hunks, or are referenced by a
  candidate finding.
- Fetch selected files through the GitHub Contents API at the exact PR head
  SHA using the job's short-lived installation token.
- Apply both per-file and total byte/token limits. Reject binary, generated,
  vendored, unsupported, and oversized content before prompt assembly.
- Treat a missing, deleted, truncated, or unsupported file as a soft miss.
  The review continues with the diff and discloses only aggregate context
  coverage in internal metadata.
- Extend the prompt context with a distinct `changed_file_context` section.
  File paths and contents are delimited as untrusted repository data and may
  never act as instructions.
- Treat added context as evidence input, not proof. Every candidate finding
  still passes Feature 24's independent evidence/adjudication gate before it
  can be persisted or published.
- Preserve the existing risk order when the context budget cannot fit every
  candidate. Authentication, authorization, API, middleware, database, and
  secret-handling code wins over tests and documentation.
- Record only safe operational metadata: number of candidates, number fetched,
  bytes/tokens supplied, and miss reasons. Never log or persist file paths
  together with contents.
- Update `architecture.md`, `schemas.md`, and prompt contracts in the same
  implementation increment.

## Security invariants

- Source content exists only in worker memory and is discarded after the job.
- Every fetch is limited to the current repository and exact validated head
  SHA; user-provided URLs or refs are never followed.
- Repository content is data, not authority. It cannot override the system
  prompt, output schema, severity rules, or security-first ordering.
- Context retrieval has a strict request count, response size, and timeout
  budget so a repository cannot amplify cost or worker duration.

## Out of scope

Import traversal, symbol lookup, callers, related tests, repository cloning,
RAG, embeddings, cross-repository context, or source persistence.

## Verification

- Pure tests cover deterministic selection, risk ordering, token cutoff,
  unsupported files, deleted files, and stable behavior when no context fits.
- GitHub client tests confirm every request uses the installation token,
  repository identity, and exact head SHA.
- Prompt snapshots prove repository content remains inside explicit untrusted
  delimiters and cannot replace system rules.
- Worker tests prove partial fetch failure still produces a review and that no
  source content appears in logs or database writes.
- End-to-end verification compares a known false-positive fixture before and
  after full-file context.
- PR #38 at `3dfdbfb` must remain finding-free for the two documented false
  positives; more context must not make a speculative candidate publishable.
