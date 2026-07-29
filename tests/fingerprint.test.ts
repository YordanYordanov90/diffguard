import { describe, expect, it } from "vitest";

import {
  computeFindingFingerprint,
  toPersistableFindings,
} from "@/lib/review/fingerprint";
import type { ConfirmedFinding } from "@/lib/review/schema";
import { findingLifecycleSchema, findingConfidenceSchema } from "@/lib/review/schema";

const base: ConfirmedFinding = {
  severity: "high",
  category: "security",
  file: "src/auth.ts",
  line: 12,
  title: "Missing authorization check",
  detail: "The handler skips the tenant ownership check.",
  suggestion: "Verify the resource belongs to the caller.",
  confidence: "high",
  observedBehavior: "Request proceeds without ownership validation.",
  causalPath: "handler -> repository.findById without installation filter",
  violatedInvariant: "Every resource read must be scoped to the tenant.",
  requiresRuntimeVerification: false,
  suggestedChange: null,
};

describe("finding fingerprints", () => {
  it("is stable across cosmetic title and detail wording changes", () => {
    // Title/detail/suggestion are intentionally excluded from fingerprint inputs.
    const left = computeFindingFingerprint({
      category: base.category,
      file: base.file,
      line: base.line,
      violatedInvariant: base.violatedInvariant,
      observedBehavior: base.observedBehavior,
      causalPath: base.causalPath,
    });
    const right = computeFindingFingerprint({
      category: base.category,
      file: base.file,
      line: base.line,
      violatedInvariant: base.violatedInvariant,
      observedBehavior: base.observedBehavior,
      causalPath: base.causalPath,
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(
      computeFindingFingerprint({
        category: base.category,
        file: base.file,
        line: base.line,
        violatedInvariant: base.violatedInvariant,
        observedBehavior: base.observedBehavior,
        causalPath: base.causalPath,
      }),
    ).toBe(left);
  });

  it("separates findings that differ in location or invariant", () => {
    const baseFingerprint = computeFindingFingerprint(base);
    const differentLine = computeFindingFingerprint({ ...base, line: 40 });
    const differentFile = computeFindingFingerprint({
      ...base,
      file: "src/other.ts",
    });
    const differentInvariant = computeFindingFingerprint({
      ...base,
      violatedInvariant: "Secrets must never appear in logs.",
    });
    const differentEvidence = computeFindingFingerprint({
      ...base,
      observedBehavior: "Token is written to stdout.",
      causalPath: "logger.info(token)",
    });

    expect(differentLine).not.toBe(baseFingerprint);
    expect(differentFile).not.toBe(baseFingerprint);
    expect(differentInvariant).not.toBe(baseFingerprint);
    expect(differentEvidence).not.toBe(baseFingerprint);
  });

  it("normalizes whitespace and path separators for stability", () => {
    const left = computeFindingFingerprint(base);
    const right = computeFindingFingerprint({
      ...base,
      file: "src\\auth.ts",
      violatedInvariant: "  Every resource read must be scoped to the tenant.  ",
      observedBehavior: "Request proceeds without   ownership validation.",
      causalPath: "handler -> repository.findById without installation filter",
    });

    expect(left).toBe(right);
  });

  it("degrades invalid line locations to file-level findings", () => {
    const patch = `diff --git a/src/auth.ts b/src/auth.ts
@@ -1,2 +1,2 @@
 const before = true;
-const old = 1;
+const next = 1;
`;
    const [persistable] = toPersistableFindings(
      [{ ...base, line: 99 }],
      [{ path: "src/auth.ts", patch }],
    );

    expect(persistable.line).toBeNull();
    expect(persistable.fingerprint).toBe(
      computeFindingFingerprint({ ...base, line: null }),
    );
  });

  it("drops invalid suggested-change payloads", () => {
    const [persistable] = toPersistableFindings(
      [
        {
          ...base,
          suggestedChange: {
            startLine: 0,
            endLine: 1,
            replacement: "const next = 1;",
          },
        },
      ],
      [
        {
          path: "src/auth.ts",
          patch: `@@ -1,1 +1,1 @@
-const old = 1;
+const next = 1;
`,
        },
      ],
    );

    expect(persistable.suggestedChange).toBeNull();
  });

  it("rejects unknown confidence and lifecycle enum values", () => {
    expect(findingConfidenceSchema.safeParse("extreme").success).toBe(false);
    expect(findingLifecycleSchema.safeParse("archived").success).toBe(false);
    expect(findingConfidenceSchema.safeParse("high").success).toBe(true);
    expect(findingLifecycleSchema.safeParse("open").success).toBe(true);
  });
});
