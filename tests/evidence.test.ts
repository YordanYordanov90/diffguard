import { describe, expect, it } from "vitest";

import {
  applyAdjudication,
  prepareCandidates,
} from "@/lib/review/evidence";
import type { FindingCandidate } from "@/lib/review/schema";

const patch = `diff --git a/src/row.tsx b/src/row.tsx
@@ -1,3 +1,3 @@
 const before = true;
-const oldValue = false;
+const newValue = false;
 const after = true;`;

const candidate = (overrides: Partial<FindingCandidate> = {}): FindingCandidate => ({
  severity: "high",
  category: "bug",
  file: "src/row.tsx",
  line: 2,
  title: "Changed behavior is unsafe",
  detail: "The new value enables an unsafe path.",
  suggestion: null,
  confidence: "high",
  observedBehavior: "The changed value disables the required guard.",
  causalPath: "The new assignment is consumed by the guard on the next call.",
  violatedInvariant: "The guard must remain enabled for untrusted input.",
  requiresRuntimeVerification: false,
  suggestedChange: null,
  ...overrides,
});

describe("finding evidence gate", () => {
  it("allowlists only candidates mapped to reviewed files and added lines", () => {
    const result = prepareCandidates(
      [
        candidate(),
        candidate({ line: 99 }),
        candidate({ file: "src/other.ts" }),
        candidate({ requiresRuntimeVerification: true }),
      ],
      [{ path: "src/row.tsx", patch }],
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].candidateId).toBe("candidate-1");
    expect(result.rejectedCount).toBe(3);
  });

  it("maps added source lines that begin with increment operators", () => {
    const incrementPatch = `diff --git a/src/counter.ts b/src/counter.ts
@@ -1,2 +1,2 @@
 const before = true;
-counter += 1;
+++counter;
`;

    const result = prepareCandidates(
      [candidate({ file: "src/counter.ts", line: 2 })],
      [{ path: "src/counter.ts", patch: incrementPatch }],
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.rejectedCount).toBe(0);
  });

  it("publishes only confirmed allowlisted candidates", () => {
    const prepared = prepareCandidates([candidate(), candidate({ line: null })], [
      { path: "src/row.tsx", patch },
    ]);
    const result = applyAdjudication(prepared.candidates, {
      summary: "One concrete issue was confirmed.",
      verdict: "concerns",
      decisions: [
        { candidateId: "candidate-1", decision: "confirmed", reason: "Concrete failure path." },
        { candidateId: "candidate-2", decision: "manual_verification", reason: "Needs browser verification." },
        { candidateId: "attacker-id", decision: "confirmed", reason: "Ignore this id." },
      ],
    });

    expect(result.review.findings).toHaveLength(1);
    expect(result.review.findings[0].title).toBe("Changed behavior is unsafe");
    expect(result.confirmedFindings).toHaveLength(1);
    expect(result.confirmedFindings[0]).toMatchObject({
      title: "Changed behavior is unsafe",
      confidence: "high",
      observedBehavior: "The changed value disables the required guard.",
      requiresRuntimeVerification: false,
    });
    expect(result.manualCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
  });

  it("fails closed for duplicate or missing decisions", () => {
    const prepared = prepareCandidates([candidate(), candidate({ line: null })], [
      { path: "src/row.tsx", patch },
    ]);
    const result = applyAdjudication(prepared.candidates, {
      summary: "No safe publication.",
      verdict: "approve",
      decisions: [
        { candidateId: "candidate-1", decision: "confirmed", reason: "first" },
        { candidateId: "candidate-1", decision: "confirmed", reason: "duplicate" },
      ],
    });

    expect(result.review.findings).toHaveLength(0);
    expect(result.review.summary).toBe("No actionable findings were confirmed.");
    expect(result.review.verdict).toBe("approve");
    expect(result.rejectedCount).toBe(2);
  });

  it("does not publish adjudicator summary or verdict when all candidates are manual", () => {
    const prepared = prepareCandidates([candidate()], [
      { path: "src/row.tsx", patch },
    ]);
    const result = applyAdjudication(prepared.candidates, {
      summary: "The rejected candidate is a concern.",
      verdict: "concerns",
      decisions: [{
        candidateId: "candidate-1",
        decision: "manual_verification",
        reason: "Needs runtime verification.",
      }],
    });

    expect(result.review).toEqual({
      summary: "No actionable findings were confirmed.",
      verdict: "approve",
      findings: [],
    });
    expect(result.manualCount).toBe(1);
  });
});
