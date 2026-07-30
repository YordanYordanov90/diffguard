import { describe, expect, it } from "vitest";

import { renderReview } from "@/lib/review/render";
import type { ReviewOutput } from "@/lib/review/schema";

const metadata = {
  filesReviewed: 4,
  skippedFiles: [],
  headSha: "abcdef1234567890abcdef1234567890abcdef12",
};

const fullReview: ReviewOutput = {
  summary: "The authentication change is mostly sound, but one access-control path needs tightening.",
  verdict: "concerns",
  findings: [
    {
      severity: "low",
      category: "quality",
      file: "src/auth.ts",
      line: null,
      title: "Clarify the fallback",
      detail: "The fallback behavior is difficult to follow.",
      suggestion: "Add a short comment explaining the intended fallback.",
    },
    {
      severity: "high",
      category: "security",
      file: "src/auth.ts",
      line: 42,
      title: "Authorization can be bypassed",
      detail: "The role check is skipped on this branch.",
      suggestion: "Require the authorization check before returning the resource.",
    },
    {
      severity: "medium",
      category: "bug",
      file: "src/session.ts",
      line: 18,
      title: "Expired sessions are accepted",
      detail: "The expiry is not checked before use.",
      suggestion: null,
    },
    {
      severity: "info",
      category: "performance",
      file: "src/session.ts",
      line: 7,
      title: "Consider caching the lookup",
      detail: "This lookup may be repeated for every request.",
      suggestion: null,
    },
  ],
};

describe("review renderer", () => {
  it("renders a full review in a stable, security-first layout", () => {
    expect(renderReview(fullReview, metadata)).toMatchInlineSnapshot(`
      "### 🛡️ DiffGuard Review

      Reviewed 4 files — 1 high-severity security issue, 4 suggestions.

      > The authentication change is mostly sound, but one access-control path needs tightening.

      ## Security findings

      - **🟠 High · Authorization can be bypassed** — \`src/auth.ts:42\`
        The role check is skipped on this branch.
        **Suggestion:** Require the authorization check before returning the resource.

      ## Other findings

      - **🟡 Medium · Expired sessions are accepted** — \`src/session.ts:18\`
        The expiry is not checked before use.

      <details>
      <summary>Low-severity and informational findings (2)</summary>

      - **⚪ Low · Clarify the fallback** — \`src/auth.ts\` (file-level)
        The fallback behavior is difficult to follow.
        **Suggestion:** Add a short comment explaining the intended fallback.

      - **ℹ️ Info · Consider caching the lookup** — \`src/session.ts:7\`
        This lookup may be repeated for every request.

      </details>

      ---
      🛡️ DiffGuard · reviewed commit \`abcdef1\` · full review"
    `);
  });

  it("renders skipped files as a disclosure block", () => {
    const output = renderReview(
      { ...fullReview, findings: [] },
      { ...metadata, skippedFiles: ["README.md", "dist/app.js"] },
    );

    expect(output).toContain("<summary>Skipped files (2)</summary>");
    expect(output).toContain("- `README.md`");
    expect(output).toContain("- `dist/app.js`");
    expect(output).not.toContain("## Security findings");
    expect(output).not.toContain("<summary>Low-severity");
  });

  it("renders a compact Linked requirements section with unmet requirements", () => {
    const output = renderReview(
      { summary: "Mostly good.", verdict: "comment", findings: [] },
      {
        ...metadata,
        linkedIssues: [
          {
            issueNumber: 12,
            title: "Add rate limiting",
            status: "addressed",
            rationale: "Per-IP limiter is present on the auth route.",
            unmetRequirements: [],
          },
          {
            issueNumber: 15,
            title: "Validate email",
            status: "not_addressed",
            rationale: "Email format is still unchecked.",
            unmetRequirements: ["Reject invalid email addresses"],
          },
          {
            issueNumber: 20,
            status: "unclear",
            rationale: "Issue content was inaccessible.",
            unmetRequirements: [],
          },
        ],
      },
    );

    expect(output).toContain("## Linked requirements");
    expect(output).toContain("**#12 · Add rate limiting** — Addressed:");
    expect(output).toContain("**#15 · Validate email** — Not addressed:");
    expect(output).toContain("- Reject invalid email addresses");
    expect(output).toContain("**#20** — Unclear:");
  });

  it("renders a concise positive zero-findings review", () => {
    const output = renderReview(
      { summary: "No actionable issues were found.", verdict: "approve", findings: [] },
      { ...metadata, filesReviewed: 0 },
    );

    expect(output).toContain("Reviewed 0 files — 0 high-severity security issues, 0 suggestions.");
    expect(output).toContain("> No actionable issues were found.");
    expect(output).not.toContain("## Security findings");
    expect(output).not.toContain("## Other findings");
    expect(output).not.toContain("<details>");
  });

  it("discloses incremental and fallback modes in the footer", () => {
    const previous = "0123456789abcdef0123456789abcdef01234567";
    const incremental = renderReview(
      { summary: "New range only.", verdict: "comment", findings: [] },
      {
        ...metadata,
        reviewMode: "incremental",
        comparedFromSha: previous,
      },
    );
    const fallback = renderReview(
      { summary: "History rewritten.", verdict: "comment", findings: [] },
      {
        ...metadata,
        reviewMode: "fallback_full",
        comparedFromSha: previous,
      },
    );

    expect(incremental).toContain(
      "🛡️ DiffGuard · reviewed commit `abcdef1` · incremental `0123456`…`abcdef1`",
    );
    expect(fallback).toContain(
      "🛡️ DiffGuard · reviewed commit `abcdef1` · full review (fallback)",
    );
  });

  it("groups reconciled findings by lifecycle outcome", () => {
    const output = renderReview(
      { ...fullReview, findings: [fullReview.findings[1]] },
      {
        ...metadata,
        reconciliation: {
          newFindings: [fullReview.findings[1]],
          recurringFindings: [fullReview.findings[2]],
          stillOpenFindings: [fullReview.findings[0]],
          resolvedFindings: [fullReview.findings[3]],
        },
      },
    );

    expect(output).toContain("## New findings");
    expect(output).toContain("## Recurring findings");
    expect(output).toContain("## Still open");
    expect(output).toContain("## Resolved in this update");
  });
});
