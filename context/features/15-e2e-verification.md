# Feature 15 — End-to-End Dev Verification (manual gate, no new code)

## Goal
Prove the pipeline on the dev environment before prod exists anywhere.

## Depends on
00–14.

## Checklist
- Open PR on scratch repo → exactly one DiffGuard comment; security
  findings render first; footer shows head SHA.
- Push a fixup → comment edited in place, new SHA in footer.
- Two pushes within debounce window → single review + `stale_sha` skip row.
- Draft PR → skipped `draft`; mark ready → review appears.
- `[skip-review]` title → skipped, no comment.
- Oversized PR (fixture repo with a huge generated file) → review posts
  with skipped-files disclosure.
- Tampered webhook signature (curl) → 401, nothing in DB.
- Exhaust daily cap (set low temporarily) → `daily_cap` skips, spend stops.
- Fix any bugs via redelivery loop; only then register/install prod app
  on owner's real repos (per 00) and repeat the first two checks there.

## Out of scope
Dashboard (16/17). Beta invites.
