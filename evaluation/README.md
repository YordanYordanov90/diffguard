# DiffGuard review-quality evaluation

This directory contains only synthetic source fixtures and recorded structured
stage outputs. It intentionally contains no private diffs, prompts, issue
bodies, comment threads, tokens, or repository source copied from customer
repositories.

Run the CI-safe pinned evaluation with:

```sh
npm run eval:recorded
```

The evaluator validates the v1 manifest, runs candidate/adjudication/targeted
evidence/verification stage accounting, computes deterministic metrics, and
checks the release gates. The recorded model identifier is metadata only; it
does not call a provider or GitHub.

Feedback promotion is human-reviewed: an authorized `@diffguard
false-positive:` or `valid` signal is first reviewed, reduced to a sanitized
synthetic or owner-controlled public fixture, assigned one label, and paired
with a recorded structured outcome. Feedback never changes prompts,
repository learnings, or production suppression rules automatically.

Live evaluation is deliberately separate:

```sh
DIFFGUARD_EVAL_LIVE=1 npm run eval:live -- --confirm
```

The command refuses to run without both explicit acknowledgements and a
developer-supplied adapter. Any adapter must operate only on the sanitized
manifest and write structured results; it must not call production mutation
endpoints, publish comments, create findings, or update learnings.
