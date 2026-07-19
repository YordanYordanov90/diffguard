# Feature 07 — Webhook Route (`app/api/webhooks/github/route.ts`)

## Goal
A secure front door: verify, validate, dispatch to handlers — nothing else.

## Depends on
02, 05.

## Scope (do)
- ORDER IS CRITICAL: `await req.text()` (raw body) → timing-safe HMAC
  verify of X-Hub-Signature-256 against that exact string → JSON.parse →
  Zod validate → dispatch by event header + action.
- 401 on bad signature (before any parsing/DB). 400 on invalid shape.
- Dispatch stubs: handlePullRequest, handleInstallation,
  handleInstallationRepos (implemented in 08/09) — unknown events → 200
  no-op.
- Respond fast; no LLM or GitHub API calls here, no awaiting review work.
- Envelope `{ success, data, error }`.

## Out of scope
Skip rules, rate limiting, enqueueing (09). Installation sync logic (08).

## Verification
Unit test signature verification with a known secret + fixture body
(valid passes, tampered body fails). Deploy; GitHub "Recent Deliveries"
shows 200 for ping event.
