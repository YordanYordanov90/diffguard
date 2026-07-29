import { describe, expect, it } from "vitest";

import {
  isAddedLine,
  mapNewFileLines,
  planInlineComments,
  renderInlineCommentBody,
  stripInlineSuggestions,
  validateSuggestedChange,
  type InlineFindingInput,
} from "@/lib/review/inline";

const patch = `diff --git a/src/auth.ts b/src/auth.ts
@@ -1,4 +1,5 @@
 const before = true;
-const old = 1;
+const next = 1;
+const extra = 2;
 const after = true;
`;

function finding(overrides: Partial<InlineFindingInput> = {}): InlineFindingInput {
  return {
    id: "finding-1",
    fingerprint: "fp-1",
    githubCommentId: null,
    confidence: "high",
    severity: "high",
    category: "security",
    file: "src/auth.ts",
    line: 2,
    title: "Missing check",
    detail: "The guard is skipped.",
    suggestion: "Restore the guard.",
    suggestedChange: null,
    ...overrides,
  };
}

describe("inline coordinate mapping", () => {
  it("maps added lines and rejects unmapped lines", () => {
    expect(isAddedLine(patch, 2)).toBe(true);
    expect(isAddedLine(patch, 3)).toBe(true);
    expect(isAddedLine(patch, 99)).toBe(false);
    expect(mapNewFileLines(patch).get(2)?.content).toBe("const next = 1;");
  });

  it("validates suggestion ranges only inside one hunk", () => {
    expect(
      validateSuggestedChange(patch, {
        startLine: 2,
        endLine: 3,
        replacement: "const next = 1;\nconst extra = 2;\n",
      }),
    ).toEqual({
      startLine: 2,
      endLine: 3,
      replacement: "const next = 1;\nconst extra = 2;\n",
    });

    expect(
      validateSuggestedChange(patch, {
        startLine: 2,
        endLine: 40,
        replacement: "const next = 1;",
      }),
    ).toBeNull();

    expect(
      validateSuggestedChange(patch, {
        startLine: 0,
        endLine: 2,
        replacement: "x",
      }),
    ).toBeNull();
  });
});

describe("inline selection", () => {
  it("selects high-confidence critical/high findings and caps at eight", () => {
    const findings = Array.from({ length: 10 }, (_, index) =>
      finding({
        id: `finding-${index}`,
        fingerprint: `fp-${index}`,
        line: 2,
        severity: index < 9 ? "high" : "medium",
        title: `Issue ${index}`,
      }),
    );

    const plan = planInlineComments(findings, [{ path: "src/auth.ts", patch }]);
    expect(plan.comments).toHaveLength(8);
    expect(plan.summaryOnlyCount).toBe(2);
  });

  it("fills remaining slots with medium findings only under the cap", () => {
    const plan = planInlineComments(
      [
        finding({ id: "h1", severity: "high", line: 2 }),
        finding({ id: "m1", severity: "medium", line: 3, title: "Medium" }),
        finding({ id: "l1", severity: "low", line: 2, title: "Low" }),
        finding({
          id: "file",
          severity: "critical",
          line: null,
          title: "File level",
        }),
        finding({
          id: "low-conf",
          confidence: "medium",
          severity: "critical",
          title: "Low conf",
        }),
      ],
      [{ path: "src/auth.ts", patch }],
    );

    expect(plan.comments.map((comment) => comment.findingId)).toEqual(["h1", "m1"]);
  });

  it("skips already-published fingerprints", () => {
    const plan = planInlineComments(
      [
        finding({ id: "old", githubCommentId: 99 }),
        finding({ id: "new", fingerprint: "fp-new", title: "New issue" }),
      ],
      [{ path: "src/auth.ts", patch }],
    );

    expect(plan.comments).toHaveLength(1);
    expect(plan.comments[0].findingId).toBe("new");
  });

  it("orders security findings before other categories", () => {
    const plan = planInlineComments(
      [
        finding({
          id: "bug",
          category: "bug",
          severity: "critical",
          title: "Bug",
        }),
        finding({
          id: "sec",
          category: "security",
          severity: "high",
          title: "Security",
        }),
      ],
      [{ path: "src/auth.ts", patch }],
    );

    expect(plan.comments.map((comment) => comment.findingId)).toEqual(["sec", "bug"]);
  });

  it("embeds a GitHub suggestion block only for validated ranges", () => {
    const plan = planInlineComments(
      [
        finding({
          suggestedChange: {
            startLine: 2,
            endLine: 2,
            replacement: "const next = safe();\n",
          },
        }),
      ],
      [{ path: "src/auth.ts", patch }],
    );

    expect(plan.comments[0].body).toContain("```suggestion");
    expect(plan.comments[0].body).toContain("const next = safe();");
    expect(plan.comments[0].hasSuggestion).toBe(true);
    expect(plan.comments[0].line).toBe(2);
  });

  it("strips suggestion blocks for retry payloads", () => {
    const body = renderInlineCommentBody({
      severity: "high",
      title: "Missing check",
      detail: "Detail",
      suggestion: "Fix it",
      suggestedChange: { startLine: 2, endLine: 2, replacement: "fixed\n" },
    });
    const stripped = stripInlineSuggestions([
      {
        findingId: "f1",
        fingerprint: "fp",
        path: "src/auth.ts",
        line: 2,
        side: "RIGHT",
        body,
        hasSuggestion: true,
      },
    ]);

    expect(stripped[0].body).not.toContain("```suggestion");
    expect(stripped[0].hasSuggestion).toBe(false);
  });
});
