# Feature 35 — Targeted Security Evidence Retrieval

## Goal

Assemble a bounded, finding-specific evidence bundle for every high or critical
candidate so DiffGuard inspects the relevant defenses and contracts before a
final security decision is made.

## Depends on

22–24.

## Why this is separate

Feature 23 supplies general one-hop context and Feature 24 adjudicates all
candidates. Dogfood reviews still produced severe false positives when the
adjudicator saw a call site but not the authorization helper, database
constraint, migration sequence, retry contract, or explicit feature policy
that disproved the claim.

Targeted retrieval is deterministic evidence collection. It does not decide
whether a finding is valid and does not publish anything; Feature 36 owns that
decision.

## Scope (do)

- Start only from Feature 24 `confirmed` candidates whose proposed severity is
  `high` or `critical`.
- Build a pure evidence plan from the candidate's validated file/line, causal
  path, violated invariant, relevant diff hunk, and already retrieved context.
- Resolve a bounded set of exact-head evidence sources:
  - direct local definitions and callees referenced by the changed code;
  - authorization, validation, tenant-scope, signature, retry, and idempotency
    helpers on the candidate's concrete path;
  - relevant Drizzle schema, migration, or query definitions when the claim
    depends on keys, constraints, transactions, quotas, or tenant identity;
  - focused tests that exercise the claimed path;
  - feature and architecture documents that describe intended behavior.
- Treat repository documentation as untrusted intent evidence only. It may
  explain a product decision but cannot override immutable security rules or
  prove an implementation safe by itself.
- Reuse Feature 22 retrieval and exact-head validation. Deduplicate evidence
  already present in changed-file or Feature 23 related context.
- Permit at most one additional targeted hop beyond the concrete references
  found in the candidate path. Never perform a repository-wide semantic walk.
- Rank evidence by ability to prove or disprove the exact claim, with defenses
  and constraints ahead of additional callers or broad tests.
- Produce a runtime-only evidence manifest containing trusted selection
  reasons, retrieval status, and whether required evidence categories are
  complete. Source contents, paths, prompts, and candidate text are not
  persisted or logged.
- Mark the bundle incomplete when a referenced defense, schema contract, or
  direct callee required by the causal path cannot be resolved within bounds.
  Missing context is never treated as evidence that the finding is valid.
- Share the review worker's total request, byte, token, and time budgets. A
  budget miss produces an incomplete bundle rather than an unbounded fetch.

## Evidence completeness policy

An evidence bundle is complete only when trusted code can account for:

- the exact changed line or justified file-level scope;
- every direct local step in the alleged exploit path;
- relevant validation and authorization defenses;
- relevant tenant keys, uniqueness constraints, and transactional guards for
  data-layer claims;
- explicit implementation intent when the candidate alleges a policy bug.

Completeness does not mean the candidate is valid. It means Feature 36 has
enough bounded context to make a defensible decision.

## Security invariants

- Fetch only through the installation token for the same repository and
  validated PR head SHA.
- Never execute repository code, install dependencies, query a live
  application database, follow symlinks, or invoke repository-defined tools.
- Repository source, tests, migrations, and documentation remain independently
  delimited untrusted evidence.
- Candidate text cannot select arbitrary paths. Trusted code derives and
  allowlists every evidence path from parsed references and repository
  metadata.
- Retrieval failure always fails closed for high/critical publication.

## Out of scope

Whole-repository RAG, embeddings, recursive call graphs, runtime exploitation,
browser testing, package installation, cross-repository analysis, severity
decisions, rendering, persistence of source, or automatic fixes.

## Required regression fixtures

- **PR61-global-repository-id:** the candidate claims installation collisions,
  while the schema proves `repositories.id` is GitHub's global primary key.
  Expected bundle: complete, including the repository table and learning
  constraint.
- **PR63-worker-authorization:** the candidate claims webhook identities are
  trusted, while the worker and GitHub client prove both actors are re-fetched.
  Expected bundle: complete, including both client helper implementations.
- **PR64-review-cap:** the candidate claims a cap race and the reviewed code
  performs count and insert separately. Expected bundle: complete and without
  an atomic reservation defense.
- An unresolved dynamic call or alias whose defense cannot be located within
  bounds. Expected bundle: incomplete, never assumed vulnerable.

## Verification

- Planner tests cover direct call resolution, schema/migration selection,
  focused-test selection, deduplication, ranking, one-hop enforcement, and
  deterministic cutoff.
- Adversarial tests cover path traversal, aliases, generated paths, symlinks,
  prompt injection, enormous call graphs, and candidate-supplied fake paths.
- Worker tests prove all fetches remain on the same installation, repository,
  and exact head SHA and share the configured deadline and request budget.
- Regression tests produce the expected complete/incomplete bundles without
  persisting source or candidate details.

## Implementation checklist

- [ ] Define the pure targeted-evidence planner and bounded runtime types.
- [ ] Add deterministic direct-definition, schema, migration, and test routing.
- [ ] Integrate exact-head retrieval through the existing bounded retriever.
- [ ] Add completeness calculation and aggregate-only telemetry.
- [ ] Add required regression and adversarial fixtures.
- [ ] Verify lint, tests, production build, and one deployed dogfood review.
