# Feature 19 — Dashboard Overview

## Goal

Answer at a glance: where is DiffGuard active, what happened recently, and
does anything need attention?

## Depends on

16, 18.

## Scope (do)

- Make `/dashboard` the operational overview rather than a duplicate of the
  full reviews table.
- Extend the validated GitHub installation-access result with the minimal
  metadata defined in `schemas.md`: installation id, account identity,
  `repository_selection`, configuration URL, and suspension state.
  Authorization still derives installation IDs server-side.
- Add shared tenant-scoped dashboard read functions for installations,
  repositories, and latest review metadata. These functions also supply
  Feature 20; no migration or persisted summary counter is required.
- Lead with the DiffGuard-specific coverage rail from `ui-context.md`:
  installation/account groups containing repository coverage counts and
  clear active, suspended, awaiting-first-review, or attention states.
- Show a compact recent-reviews section using the existing Feature 17 row
  and detail behavior. Include a clear `View all reviews` route action.
- Show only useful derived totals: accessible installations, covered
  repositories, reviews today, and repositories needing attention. Do not
  add decorative analytics or historical charts.
- Define attention conservatively from stored metadata:
  suspended installation, latest review `failed`, or latest completed review
  with verdict `concerns`. A repository with no reviews is
  `Awaiting first review`, not an error.
- All aggregates and recent rows are computed server-side from tenant-scoped
  data. Installation IDs come only from Feature 16 access resolution.
- Provide directed states:
  - no repositories → choose repositories on GitHub;
  - repositories but no reviews → open a pull request;
  - read failure → safe generic error and retry action, never a raw error.

## Out of scope

Charts, spend projections, billing, model configuration, repository toggles,
WebSockets, or new persisted counters.

## Verification

- Summary counts match repository and review fixtures across multiple
  accessible installations.
- `all`/`selected` access metadata and GitHub configuration URLs are validated
  before they enter the overview read model.
- A tenant cannot affect results by supplying installation IDs.
- Empty, awaiting-first-review, attention, and healthy states render with
  the exact vocabulary defined in `ui-context.md`.
- Recent review selection opens the existing detail view and `View all
  reviews` reaches `/dashboard/reviews`.
