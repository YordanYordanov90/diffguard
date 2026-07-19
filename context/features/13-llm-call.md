# Feature 13 — LLM Call (`lib/review/generate.ts`)

## Goal
One function: messages in → validated ReviewOutput out, within budget.

## Depends on
02, 05, 11.

## Scope (do)
- `generateObject` with the ReviewOutput Zod schema, model from
  `getModel(installation)`.
- AbortController with LLM_TIMEOUT_MS.
- On schema/parse failure: ONE retry with the validation error appended
  to the conversation; second failure → throw a typed ReviewFailedError.
- Return output + usage (input/output tokens) for persistence.
- Never log prompt contents (contains diff) — log model, duration, token
  counts only.

## Out of scope
Prompt assembly (11), rendering (12), DB writes and orchestration (14).

## Verification
Unit tests with a mocked model: happy path; invalid-then-valid retry;
double failure throws; timeout aborts.
