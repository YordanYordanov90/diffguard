# Feature 02 — Config & Env Validation (`lib/config/`)

## Goal
One typed, validated source for all env vars and tunable constants.

## Depends on
01.

## Scope (do)
- Zod env schema validated at startup: DATABASE_URL, GitHub App id /
  base64 private key / webhook secret, QStash keys, Upstash Redis keys,
  Clerk keys, ANTHROPIC_API_KEY / OPENAI_API_KEY (both optional).
- Required GitHub App OAuth vars: client ID, client secret, exact callback URL,
  and a 32-byte base64 encryption key for encrypted Redis token storage.
- Optional GitHub App slug (`GITHUB_APP_SLUG`, default `diffguard-dev`) for
  the dashboard's repository-install link.
- Constants file: DEBOUNCE_SECONDS (75), DAILY_REVIEW_CAP,
  RATE_LIMIT (events/min per installation), DIFF_TOKEN_BUDGET (~55k),
  INSTRUCTIONS_TOKEN_CAP (~2k), LLM_TIMEOUT_MS (120000), DEFAULT_MODEL.
- `getModel(installation)`: reads installation model string, resolves to
  an AI SDK model instance; fails gracefully with a clear error if the
  provider key for the configured model is missing.

## Out of scope
Any route, DB, or LLM call. No hardcoded model strings anywhere else — ever.

## Verification
Unit tests: env schema rejects missing vars; getModel resolves default and
errors cleanly on missing provider key. Build passes.
