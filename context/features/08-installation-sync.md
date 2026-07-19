# Feature 08 — Installation Sync Handlers

## Goal
DB mirrors GitHub installation state automatically.

## Depends on
04, 07.

## Scope (do)
- handleInstallation: created → upsertInstallation + syncRepositories;
  deleted → deleteInstallation (cascade repos); suspend/unsuspend →
  suspended flag.
- handleInstallationRepos: added/removed → syncRepositories.
- Suspended installations produce no reviews (checked later in 09).

## Out of scope
pull_request handling (09). Any UI.

## Verification
Redeliver captured installation events from the dev app against the dev
deployment; rows appear/disappear correctly in Neon console. Save payloads
as test fixtures.
