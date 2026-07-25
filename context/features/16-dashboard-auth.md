# Feature 16 — Dashboard Auth & Access Resolution (backend only)

## Goal
Signed-in users can be resolved to the exact set of installations GitHub
says they may access. No UI beyond Clerk's own components.

## Depends on
04, 06. Independent of 07–15.

## Scope (do)
- Clerk integration: middleware protecting `app/(dashboard)/`; GitHub
  OAuth as the ONLY sign-in method; custom DiffGuard sign-in/sign-up UI using
  Clerk's `useSignIn` / `useSignUp` hooks and Clerk's OAuth callback handler.
- getAccessibleInstallations(): Clerk user id → one-time GitHub App user
  authorization → encrypted access/refresh token in Upstash Redis →
  getUserInstallations (06) → installation ids; short-lived cache (~5 min)
  keyed by user id.
- Dashboard onboarding presents GitHub authorization and repository setup as
  explicit actions. It does not redirect a newly signed-in user without an
  explanation. The callback validates a one-time state record bound to the
  Clerk user, exchanges the code, and stores encrypted tokens. Access tokens
  refresh automatically; revoked/expired authorization returns to the
  dashboard connection step.
- Repository selection remains on GitHub's secure GitHub App install page,
  linked from the dashboard onboarding state. DiffGuard cannot select a
  user's repositories on their behalf.
- Server-side guard helper used by every dashboard read: resolves ids and
  passes them to listReviews/getReviewDetail. installation_id is NEVER
  read from params, query strings, or client state.
- Empty state contract: user with zero installations → empty list, not
  an error.

## Out of scope
All visual components, tables, styling (17). Any pipeline change.

## Verification
Unit test the guard with mocked Clerk/GitHub. Manual: sign in as owner →
ids returned; a second GitHub account without the app → empty set.
