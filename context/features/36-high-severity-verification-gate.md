# Feature 36 — High-Severity Verification Gate

## Goal

Prevent a high or critical finding from reaching GitHub unless an independent,
fail-closed verification pass proves the concrete failure path after inspecting
the targeted evidence assembled by Feature 35.

## Depends on

24, 35.

## Why this is separate

Feature 24 rejects general speculation, but dogfood reviews still promoted
severe claims that missed existing defenses, confused intended policy with a
bug, or duplicated one root cause at multiple severities. A second model vote
over the same context is not sufficient; verification must receive new,
finding-specific evidence and follow stricter publication rules.

## Scope (do)

- Route only Feature 24 `confirmed` high/critical candidates through this gate.
  Medium, low, and info findings keep the Feature 24 path.
- Call a separate no-tool structured verifier with:
  - the exact allowlisted candidate;
  - the relevant changed hunk;
  - Feature 35's targeted evidence and completeness manifest;
  - immutable severity definitions and publication rules.
- Require the verifier to try to disprove the candidate and explicitly inspect
  benign explanations, existing defenses, authorization sources, database
  constraints, retry/idempotency behavior, feature intent, and duplicate root
  causes.
- Require one structured decision per allowlisted candidate:
  `verified`, `downgraded`, `rejected`, or `manual_verification`.
- Permit `verified` only when the evidence bundle is complete and the output
  supplies concrete attack preconditions, a changed-code causal path, the
  crossed trust boundary, impact, and defenses checked.
- Permit `downgraded` only to `medium`, `low`, or `info`. Verification can
  never raise the candidate's severity.
- Publish high/critical only for `verified`. Publish a `downgraded` candidate
  at its validated lower severity. Suppress `rejected` and
  `manual_verification` from findings, counts, inline comments, verdict, and
  dashboard attention.
- Merge semantically duplicate candidates before rendering. One root cause
  produces one finding at the strongest verified severity.
- Rebuild summary, verdict, counts, persistence inputs, and inline plans from
  the post-verification allowlist only. Candidate or verifier draft summaries
  are never published directly.
- Share one bounded worker deadline and configure an explicit verification
  token budget. Empty high/critical input produces no third LLM call.
- Fail closed: timeout, incomplete evidence, malformed output, missing or
  duplicate candidate ids, arbitrary ids, or uncertain decisions confirm no
  high/critical finding.
- Record aggregate verification telemetry only: candidates, verified,
  downgraded, rejected, manual-verification, model, tokens, and duration.
  Never persist verifier reasoning, candidate text, prompts, diffs, or source.

## High/critical publication requirements

A severe finding is publishable only when all requirements are satisfied:

1. The attacker and required privileges are concrete and realistic.
2. The trust boundary and security impact are explicit.
3. The causal path begins in changed code and every direct local step is
   supported by supplied evidence.
4. Relevant validation, authorization, signature, tenant, constraint,
   transaction, retry, and idempotency defenses were inspected.
5. The claim does not depend on corrupted trusted state, a future refactor,
   arbitrary payload tampering after signature verification, or an impossible
   identity collision unless the change itself enables that condition.
6. The issue is not merely an intentional product-policy decision.
7. No required evidence category is missing.
8. The finding is not a duplicate of another verified root cause.

Critical severity additionally requires a concrete path to broad tenant or
system compromise, secret exposure, arbitrary code execution, or comparably
catastrophic impact. A correctness problem in security-adjacent code is not
critical merely because it mentions tenants or authorization.

## Security invariants

- The verifier has no tools and cannot fetch, execute, mutate, persist, or
  publish anything.
- Candidate and repository content remain independently delimited untrusted
  data. Only trusted code supplies candidate ids, evidence manifests, severity
  rules, and the final publication allowlist.
- Model agreement is not proof. A `verified` decision without complete
  targeted evidence is rejected by trusted code.
- Security findings remain subject to the same schema, location, stale-head,
  tenant, and idempotency checks as every other finding.
- Repository documentation cannot weaken immutable DiffGuard security rules.

## Out of scope

Runtime penetration testing, browser execution, package installation,
majority-vote model ensembles, automatic code changes, Checks API merge
blocking, persistence of verification reasoning, or automatic prompt changes
from user feedback.

## Required regression fixtures

- All seven historical high/critical-labelled DiffGuard suggestions from the
  PR review audit. Expected result: none remains high/critical without a proven
  exploit path; the PR #64 migration root cause may survive only at an
  evidence-supported lower severity and without duplication.
- One real cross-tenant query missing `installation_id`. Expected result:
  verified high or critical according to demonstrated impact.
- One signature-verification ordering regression. Expected result: verified
  severe security finding.
- One incomplete-evidence security candidate. Expected result:
  `manual_verification`, suppressed from published findings.

## Verification

- Contract tests reject missing, duplicate, and arbitrary candidate ids,
  invalid severity transitions, incomplete verified decisions, and oversized
  evidence fields.
- Golden tests cover verified, downgraded, rejected, manual, duplicate, empty,
  timeout, and malformed-output paths.
- Worker tests prove no severe candidate reaches rendering, persistence, or
  inline publication before verification succeeds.
- Cost tests prove no third call occurs without high/critical candidates and
  all three review calls remain inside one configured deadline.
- A deployed replay of the historical false-positive cases publishes zero
  false high/critical findings.

## Implementation checklist

- [x] Add the bounded `SecurityVerificationOutput` Zod contract.
- [x] Add trusted validation, severity-transition, and deduplication logic.
- [x] Add the no-tool verifier prompt and provider-agnostic generation call.
- [x] Wire fail-closed verification before rendering and persistence.
- [x] Add aggregate review telemetry and its Drizzle migration.
- [ ] Add historical false-positive and true-vulnerability golden fixtures.
- [x] Verify lint, tests, and production build.
- [ ] Verify deployed replay acceptance.
