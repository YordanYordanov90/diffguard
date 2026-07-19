# Feature 12 — Comment Renderer (pure, `lib/review/render.ts`)

## Goal
ReviewOutput + metadata in → the exact markdown comment body out.

## Depends on
05.

## Scope (do)
- Layout: one-line plain-language summary ("Reviewed N files — X
  high-severity security issues, Y suggestions") → security findings
  first → other categories → collapsible <details> for low/info →
  skipped-files disclosure block when non-empty → footer
  "🛡️ DiffGuard · reviewed commit `abc1234`".
- Severity badges per ui-context mapping (emoji/text — this is GitHub
  markdown, not the dashboard).
- Findings with line → `path/file.ts:42`; line null → file-level note.
- Zero-findings case: short positive summary, no empty sections.
- Deterministic and snapshot-stable.

## Out of scope
Posting the comment (06/14). Severity count rollups to DB (14 computes
from the same ReviewOutput).

## Verification
Vitest snapshots: full review, zero findings, skipped files present,
null-line findings.
