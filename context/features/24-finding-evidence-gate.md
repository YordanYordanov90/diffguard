# Feature 24 — Finding Evidence & False-Positive Gate

## Goal

Prevent uncertain, speculative, or contradicted review candidates from becoming
DiffGuard findings, even when the initial reviewer assigns them a medium or
high confidence.

## Depends on

13, 22, 23.

## Why this is separate

More repository context improves reasoning but does not prove that a candidate
is correct. PR #38 at commit `3dfdbfb` provides two regression cases:

- a correct mobile accessibility fix was described as a possible regression;
- valid list structure was reported as a possible visual problem using
  "could", "I couldn't verify", and "manually verify" language.

Confidence emitted by the same model that created the candidate is not an
independent quality check. Candidate generation and adjudication therefore
remain separate pipeline steps.

## Scope (do)

- Treat the first structured LLM result as candidate findings, not publishable
  findings.
- Require every candidate to include:
  - a concrete observed behavior;
  - the relevant file and validated changed line, or a justified file-level
    scope;
  - a causal explanation connecting the changed code to the claimed impact;
  - the violated invariant, requirement, or unsafe behavior;
  - whether runtime or visual verification is still required.
- Run a bounded adjudication pass over candidate findings. Give the adjudicator
  the exact candidate, relevant diff hunk, selected full-file/related context,
  and immutable review rules.
- Instruct the adjudicator to try to disprove the candidate by checking benign
  explanations, intended behavior, surrounding structure, and whether the
  suggested change would undo a valid fix.
- Return a structured decision for each allowlisted candidate:
  `confirmed`, `rejected`, or `manual_verification`, with a concise reason.
- Treat the candidate-stage summary and verdict as untrusted drafts. The
  adjudication output supplies the final summary and verdict based only on
  confirmed candidates; trusted code assembles the publishable review.
- Publish and persist only `confirmed` findings. `rejected` and
  `manual_verification` candidates do not affect severity counts, verdict,
  summary text, inline comments, or dashboard attention.
- Record aggregate adjudication telemetry only: candidate count, confirmed
  count, rejected count, manual-verification count, model, tokens, and
  duration. Do not persist rejected candidate text or supporting source.
- Skip the adjudication call when the candidate list is empty.
- Share one total worker deadline and a separate bounded token budget with the
  existing generation call. An adjudication timeout fails closed by
  suppressing unverified candidates rather than publishing them.
- Keep the existing one-retry-on-schema-failure rule for each structured call.
  Malformed adjudication output confirms nothing.

## Rejection requirements

Trusted code always rejects a candidate when its path/line cannot be mapped to
the reviewed diff/head SHA, it declares that runtime verification is required,
or its adjudication decision is anything other than `confirmed`.

The adjudicator is required to reject a candidate when:

- its claimed structure contradicts the parsed code supplied for verification;
- it only asks a question or recommends checking something manually;
- it describes a possibility without a concrete failure path;
- it treats two separate, keyboard-operable actions as defective merely
  because they require separate focus stops;
- it reports visual spacing or responsive drift without observable evidence;
- its fix would recreate a known-invalid structure present earlier in the PR.

Hedging words alone are not the decision rule; the absence of concrete evidence
is. Legitimate risk statements may use cautious language and still be
confirmed when the causal path is explicit.

## Security invariants

- The adjudicator receives no tools and cannot fetch, execute, mutate, or
  publish anything.
- Candidate text, repository content, prior findings, and repository
  instructions remain independently delimited as untrusted data.
- Candidate ids are created by trusted code. Adjudication decisions may
  reference only the allowlisted ids supplied for that call.
- Security findings are not exempt from evidence requirements. Severity cannot
  compensate for missing evidence.
- Rejected candidate details, diffs, source, and prompts are never logged or
  persisted.

## Out of scope

Finding persistence and fingerprints (25), inline comments (26), user
feedback, repository learnings, runtime browser testing, visual regression
testing, or model fine-tuning.

## Required regression fixtures

- **PR38-mobile-siblings:** a review-detail button and external PR link are
  sibling controls. Expected result: no finding; two focus stops represent two
  distinct actions.
- **PR38-coverage-rail:** valid nested `ul`/`li` structure with decorative
  `aria-hidden` connectors and no demonstrated spacing failure. Expected
  result: no finding.
- A true nested anchor-inside-button version of the mobile row. Expected
  result: confirmed accessibility finding.
- A malformed list or connector state with an observable semantic/accessibility
  failure. Expected result: confirmed finding.

## Verification

- Golden evaluation tests run all four fixtures and assert the expected
  confirmed/rejected outcomes.
- Tests prove `manual_verification` candidates never appear in rendered review
  output or counts.
- Adversarial tests cover overconfident candidates, fabricated line evidence,
  prompt injection, arbitrary candidate ids, and adjudication timeout.
- Cost tests prove zero candidates produce no second call and configured
  budgets remain bounded.
- A replay of PR #38 at `3dfdbfb` produces zero findings for the two original
  false positives.
