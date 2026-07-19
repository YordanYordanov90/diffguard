# Feature 17 — Dashboard UI (frontend only)

## Goal
The minimal read-only dashboard: reviews table + detail view.

## Depends on
16.

## Scope (do)
- `app/(dashboard)/` pages using tokens from `context/ui-context.md`
  (declared in the `@theme` block): navbar (shield mark + Clerk user
  button), max-width content column.
- Reviews table (shadcn data table): repo (mono), PR # linked to GitHub,
  status badge (mapping per ui-context), findings count, model, duration,
  timestamp. Light polling ~5s (`use client` on the table only) or a
  refresh button — no websockets.
- Detail view (sheet/dialog): rendered review markdown; failed → error
  callout with stored error text; skipped → reason badge.
- Data via the Feature 16 guard only. Read-only: no toggles, settings,
  charts, mutations.

## Out of scope
Any backend/query changes. Settings, enable/disable, billing, charts —
Phase 2/3. If a "quick extra" isn't answering "did my PR go through and
what happened", it does not ship here.

## Verification
Build passes; signed-in owner sees own reviews updating while a scratch-repo
PR flows through; second account sees the empty state. This completes
Phase 1 → invite beta users.
