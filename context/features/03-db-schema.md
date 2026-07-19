# Feature 03 — Database Schema & Migration (`lib/db/schema.ts`)

## Goal
Drizzle schema exactly matching `context/schemas.md`, migrated to Neon dev.

## Depends on
02.

## Scope (do)
- Tables: installations, repositories, reviews — fields, enums (pgEnum for
  ReviewStatus, SkipReason, Severity-count columns as integers, Verdict),
  defaults, FKs exactly as specified in `schemas.md`.
- UNIQUE (repository_id, pr_number, head_sha) on reviews.
- INDEX (installation_id, created_at) on reviews.
- `drizzle-kit generate` + `drizzle-kit migrate` against Neon dev branch.
- Drizzle client in `lib/db/client.ts` (Neon serverless driver).

## Out of scope
Query functions (04). Any route. No `drizzle-kit push` — migrations only.

## Verification
Migration applies cleanly; tables visible in Neon console with the unique
constraint present. Build passes.
