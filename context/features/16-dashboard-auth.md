# Feature 16 — Dashboard Auth & Access Resolution (backend only)

## Goal
Signed-in users can be resolved to the exact set of installations GitHub
says they may access. No UI beyond Clerk's own components.

## Depends on
04, 06. Independent of 07–15.

## Scope (do)
- Clerk integration: middleware protecting `app/(dashboard)/`; GitHub
  OAuth as the ONLY sign-in method; default Clerk sign-in page.
- getAccessibleInstallations(): user's GitHub OAuth token (via Clerk) →
  getUserInstallations (06) → installation ids; short-lived cache
  (~5 min, Upstash Redis) keyed by user id.
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
