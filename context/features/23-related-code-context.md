# Feature 23 — Related Code Context

## Goal

Improve codebase-level reasoning by adding a small, deterministic set of
definitions, dependencies, consumers, and tests related to the changed code.

## Depends on

22.

## Scope (do)

- Build a pure related-context planner from changed paths, imports, exported
  symbols, and repository file metadata already available from GitHub.
- Start with one-hop relationships only:
  - directly imported local modules;
  - local definitions referenced by changed code;
  - direct consumers when GitHub code search can identify them reliably;
  - conventionally colocated tests for changed production files.
- Resolve only repository-relative paths at the exact PR head SHA. Ignore
  packages, aliases, dynamic imports, generated paths, and ambiguous matches
  unless they can be resolved without guessing.
- Rank candidates by security relevance, directness, and whether the changed
  code modifies a public contract. Deduplicate candidates already supplied by
  Feature 22.
- Fetch through the bounded context retriever from Feature 22 and share its
  global request, byte, token, and timeout limits.
- Put related files in a separate `related_code_context` prompt section that
  explains why each file was selected while treating all content as untrusted.
- Add a review rule that context may support or reject a finding, but absence
  of context must never be presented as proof that a change is safe.
- Expose only aggregate context metrics in review metadata so beta dogfooding
  can measure whether the extra context improves findings.

## Security invariants

- Never execute repository code, install dependencies, follow symlinks, or
  evaluate dynamic import expressions.
- Never search outside the authorized repository or cross the validated head
  SHA boundary.
- Stop traversal after one hop and enforce a hard candidate/fetch limit.
- No source, code-search result, prompt, or retrieved file content is logged or
  persisted.

## Out of scope

Whole-repository code graphs, AST services, embeddings, semantic indexes,
multi-repository analysis, package installation, build execution, or an
unbounded recursive dependency walk.

## Verification

- Unit tests cover import resolution, path normalization, alias rejection,
  one-hop enforcement, deduplication, risk ranking, and deterministic cutoff.
- Adversarial fixtures cover traversal strings, symlink-like paths, generated
  imports, prompt-injection text, and very wide dependency graphs.
- Worker tests prove all related fetches use the same installation and head
  SHA and remain inside the shared context budget.
- A beta evaluation set compares false positives and missed cross-file bugs
  against Feature 22 alone before this feature is enabled by default.
