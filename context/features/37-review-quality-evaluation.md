# Feature 37 — Review Quality Evaluation & Calibration

## Goal

Measure DiffGuard's precision continuously and block review-pipeline changes
that reintroduce known false positives, duplicate findings, or unsupported
high/critical severity.

## Depends on

30, 35–36.

## Baseline

The 2026-08-01 audit of 16 canonical DiffGuard PR reviews found 29 final
suggestions:

- 7 actionable defects or reliability fixes;
- 5 optional hardening or quality improvements;
- 17 false positives, intentional behaviors, policy disagreements,
  speculative claims, or duplicates;
- 7 high/critical-labelled suggestions, with no demonstrated high-severity
  exploit. The real PR #64 migration concern was duplicated and overstated.

This baseline is a calibration dataset, not a claim that future reviews should
produce fewer findings at any cost. The objective is evidence-backed precision.

## Scope (do)

- Maintain a versioned offline evaluation manifest for canonical findings with
  human-reviewed labels:
  - `actionable_defect`;
  - `optional_hardening`;
  - `intentional_behavior`;
  - `false_positive`;
  - `policy_question`;
  - `duplicate`;
  - `severity_overstated`.
- Store sanitized source fixtures only for owner-controlled public test
  repositories or synthetic cases. Never copy private repository source,
  diffs, prompts, issue bodies, or comment threads into the evaluation set.
- Promote `@diffguard valid` and `@diffguard false-positive:` feedback into the
  evaluation manifest only after human review and sanitization. Feedback never
  changes production prompts or model behavior automatically.
- Include both negative and positive fixtures for authorization, tenant
  scoping, prompt injection, migrations, quota races, retries, accessibility,
  parser behavior, and intended product policies.
- Run candidate generation, Feature 24 adjudication, targeted evidence, and
  Feature 36 verification separately so regressions can be attributed to the
  correct stage.
- Produce a deterministic evaluation report with:
  - actionable precision by category and severity;
  - high/critical precision;
  - false-positive and optional-hardening rates;
  - severity overstatement rate;
  - duplicate-root-cause rate;
  - incomplete-evidence publication attempts;
  - candidate rejection/downgrade reasons;
  - token cost and latency per stage.
- Compare prompt, model, retrieval, or schema changes against a pinned baseline
  before deployment. Store only aggregate reports and fixture identifiers.
- Keep model/provider selection configurable through the existing provider
  layer. Evaluation must compare equivalent settings and record the selected
  model identifier in the report.

## Release gates

- Known false high/critical fixtures: 100% rejected or correctly downgraded.
- High/critical precision: at least 90% once the set contains enough positive
  and negative severe cases to make the metric meaningful.
- Published high/critical findings with incomplete evidence: zero.
- Duplicate root causes in final output: below 5%, with a target of zero.
- PR #38, #61, #63, and #64 regression expectations remain stable.
- No increase in malformed-output publication; malformed output always fails
  closed.

A failed gate blocks rollout of the review-pipeline change. It does not block
unrelated dashboard or documentation work.

## Security and privacy invariants

- No private source, diffs, prompts, issue bodies, or conversation text are
  persisted in fixtures, reports, CI artifacts, or logs.
- Fixture labels and expected decisions are trusted test data; repository
  content inside fixtures remains untrusted model input.
- Evaluation scripts cannot call production mutation endpoints, publish GitHub
  comments, create findings, or update repository learnings.
- False-positive feedback is never converted automatically into a rule that
  could suppress future security findings.
- Aggregate metrics are not tenant authorization inputs and cannot affect
  another installation's review.

## Out of scope

Online reinforcement learning, model fine-tuning, automatic prompt mutation,
leaderboards, customer-facing analytics, billing, storing private review
content, or replacing human acceptance review for high-impact prompt changes.

## Verification

- Manifest validation rejects unknown labels, duplicate fixture ids, missing
  expected outcomes, private-source markers, and unbounded fixture content.
- Evaluation tests prove stage-level and end-to-end metrics are deterministic
  for pinned model outputs or recorded structured fixtures.
- CI tests prove a reintroduced historical false positive fails the release
  gate while an unrelated application change can skip expensive live-model
  evaluation.
- A manual beta report compares accepted, dismissed, and false-positive
  feedback without exposing finding text from private repositories.

## Implementation checklist

- [ ] Create the sanitized evaluation manifest and validation schema.
- [ ] Label the 29 canonical historical suggestions and add safe fixtures.
- [ ] Add true-positive severe authorization and tenant-isolation fixtures.
- [ ] Add stage-level and end-to-end evaluation runners.
- [ ] Add deterministic metric calculation and release thresholds.
- [ ] Add a CI-safe recorded-output mode and an explicit live-model command.
- [ ] Document the human feedback-promotion and release-review process.
- [ ] Run the baseline, record results, and approve the first calibrated gate.
