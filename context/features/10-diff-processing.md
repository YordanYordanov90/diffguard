# Feature 10 — Diff Processing (pure, `lib/review/diff.ts`)

## Goal
Raw unified diff in → prioritized, budgeted diff + skipped-files list out.

## Depends on
02, 05 (pure — no I/O).

## Scope (do)
- Parse unified diff into per-file chunks (path + patch text).
- Exclude: lockfiles (package-lock.json, pnpm-lock.yaml, yarn.lock),
  generated/minified (*.min.*, dist/, build/, .next/), binaries, images,
  vendored deps.
- Risk ranking: auth/middleware/api/db/config paths first; src code next;
  tests, docs, markdown last.
- Fill DIFF_TOKEN_BUDGET (approximate tokenizer: chars/4 is acceptable);
  overflow files → skippedFiles[] in ranked order.
- Deterministic: same input → same output.

## Out of scope
Fetching anything. Prompt text. LLM. Rendering.

## Verification
Vitest: exclusion list, ranking order, budget cutoff, skippedFiles content
— fixture diffs including one oversized multi-file diff.
