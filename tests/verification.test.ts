import { describe, expect, it } from "vitest";

import {
  securityVerificationOutputSchema,
} from "@/lib/review/schema";
import {
  applySecurityVerification,
  type VerifiableCandidate,
} from "@/lib/review/verification";

const candidate = (overrides: Partial<VerifiableCandidate> = {}): VerifiableCandidate => ({
  candidateId: "candidate-1",
  severity: "high",
  category: "security",
  file: "src/auth.ts",
  line: 4,
  title: "Authorization bypass",
  detail: "The changed branch skips a required check.",
  suggestion: null,
  confidence: "high",
  observedBehavior: "The changed branch accepts an untrusted identity.",
  causalPath: "The request reaches the handler without the authorization helper.",
  violatedInvariant: "Every tenant lookup must be installation scoped.",
  requiresRuntimeVerification: false,
  suggestedChange: null,
  ...overrides,
});

const complete = {
  completeCandidateIds: ["candidate-1"],
  incompleteCandidateIds: [],
  missingByCandidate: {},
};

function decision(candidateId: string, overrides: Record<string, unknown> = {}) {
  return {
    candidateId,
    decision: "verified" as const,
    finalSeverity: "high" as const,
    evidenceComplete: true,
    attackPreconditions: "The attacker can submit a request as a lower-privileged user.",
    trustBoundary: "The request crosses the API authorization boundary.",
    exploitPath: "Changed handler input reaches the tenant query without the guard.",
    impact: "A user can read another tenant's review metadata.",
    defensesChecked: ["authorization helper", "installation scope"],
    missingEvidence: [],
    reason: "The exact changed path is supported by complete evidence.",
    duplicateOfCandidateId: null,
    ...overrides,
  };
}

describe("high-severity verification gate", () => {
  it.each([
    ["verified", { decision: "verified", finalSeverity: "high" }, 1, 0, 0, 0],
    ["downgraded", { decision: "downgraded", finalSeverity: "medium" }, 0, 1, 0, 0],
    ["rejected", { decision: "rejected", finalSeverity: null }, 0, 0, 1, 0],
    ["manual", { decision: "manual_verification", finalSeverity: null }, 0, 0, 0, 1],
  ])("handles %s decisions", (_name, overrides, verified, downgraded, rejected, manual) => {
    const result = applySecurityVerification(
      [candidate()],
      { decisions: [decision("candidate-1", overrides)] },
      complete,
    );

    expect(result.candidates).toHaveLength(verified + downgraded);
    expect(result.verifiedCount).toBe(verified);
    expect(result.downgradedCount).toBe(downgraded);
    expect(result.rejectedCount).toBe(rejected);
    expect(result.manualCount).toBe(manual);
    if (verified + downgraded > 0) {
      expect(result.review.findings[0]?.severity).toBe(downgraded ? "medium" : "high");
    }
  });

  it("fails closed for incomplete verified evidence", () => {
    const result = applySecurityVerification(
      [candidate()],
      { decisions: [decision("candidate-1", { evidenceComplete: false })] },
      { completeCandidateIds: [], incompleteCandidateIds: ["candidate-1"], missingByCandidate: {
        "candidate-1": ["security_defense"],
      } },
    );

    expect(result.candidates).toEqual([]);
    expect(result.manualCount).toBe(1);
  });

  it.each([
    { decisions: [] },
    { decisions: [decision("candidate-1"), decision("candidate-1")] },
    { decisions: [decision("attacker-id")] },
  ])("rejects missing, duplicate, or arbitrary ids", (output) => {
    const result = applySecurityVerification([candidate()], output, complete);
    expect(result.malformed).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(result.rejectedCount).toBe(1);
  });

  it("merges duplicate roots at the strongest verified severity", () => {
    const second = candidate({ candidateId: "candidate-2", severity: "critical", line: 8 });
    const result = applySecurityVerification(
      [candidate(), second],
      {
        decisions: [
          decision("candidate-1"),
          decision("candidate-2", {
            finalSeverity: "critical",
            duplicateOfCandidateId: "candidate-1",
          }),
        ],
      },
      { completeCandidateIds: ["candidate-1", "candidate-2"], incompleteCandidateIds: [], missingByCandidate: {} },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.severity).toBe("critical");
    expect(result.rejectedCount).toBe(1);
  });

  it("rejects invalid severity transitions and oversized evidence", () => {
    const invalid = decision("candidate-1", { decision: "downgraded", finalSeverity: "critical" });
    const oversized = decision("candidate-1", { reason: "x".repeat(2_001) });
    expect(applySecurityVerification([candidate()], { decisions: [invalid] }, complete).manualCount).toBe(1);
    expect(securityVerificationOutputSchema.safeParse({ decisions: [oversized] }).success).toBe(false);
  });
});
