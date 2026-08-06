import { describe, expect, it } from "vitest";

import {
  assessTargetedSecurityEvidence,
  planTargetedSecurityEvidence,
  type TargetedEvidencePlan,
} from "@/lib/review/targeted-evidence";

const changedFile = (path: string, patch: string) => ({ path, patch });

describe("targeted security evidence planning", () => {
  it("plans bounded direct callees, defenses, contracts, tests, and intent", () => {
    const plan = planTargetedSecurityEvidence({
      findings: [{
        candidateId: "candidate-1",
        file: "src/auth/controller.ts",
        severity: "high",
        category: "security",
      }],
      changedFiles: [changedFile(
        "src/auth/controller.ts",
        'import { check } from "../security/check";\nexport function run() {}',
      )],
      fullFileContext: [{
        file: "src/auth/controller.ts",
        content: 'import { check } from "../security/check";\nexport function run() {}',
      }],
      relatedCodeContext: [],
      repositoryPaths: [
        "src/auth/controller.ts",
        "src/auth/controller.test.ts",
        "src/security/check.ts",
        "src/db/store.ts",
        "context/architecture.md",
      ],
      maxFiles: 6,
      requestBudget: 6,
    });

    expect(plan.requirements).toEqual([{
      candidateId: "candidate-1",
      requiredCategories: ["direct_callee", "security_defense", "feature_intent"],
      requiredFiles: ["src/security/check.ts"],
      unresolvedReference: false,
    }]);
    const files = plan.candidates.map((candidate) => candidate.file);
    expect(files).toEqual(expect.arrayContaining([
      "src/auth/controller.ts",
      "src/security/check.ts",
      "context/architecture.md",
      "src/auth/controller.test.ts",
    ]));
    expect(plan.candidates.find((candidate) => candidate.file === "src/security/check.ts")?.reasons)
      .toContain("direct_callee");
  });

  it("deduplicates shared paths and excludes unsafe or generated paths", () => {
    const plan = planTargetedSecurityEvidence({
      findings: [{
        candidateId: "candidate-1",
        file: "src/db/store.ts",
        severity: "critical",
        category: "bug",
      }],
      changedFiles: [changedFile("src/db/store.ts", "export const value = 1;")],
      fullFileContext: [],
      relatedCodeContext: [],
      repositoryPaths: [
        "src/db/store.ts",
        "src/db/store.test.ts",
        "src/schema.ts",
        "dist/generated.js",
        "../secrets.txt",
      ],
      maxFiles: 10,
      requestBudget: 10,
    });

    expect(plan.candidates.map((candidate) => candidate.file)).not.toContain("dist/generated.js");
    expect(plan.candidates.map((candidate) => candidate.file)).not.toContain("../secrets.txt");
    expect(new Set(plan.candidates.map((candidate) => candidate.file)).size).toBe(plan.candidates.length);
  });

  it("marks a candidate incomplete when required evidence is missing", () => {
    const plan: TargetedEvidencePlan = {
      candidates: [{
        file: "src/auth/check.ts",
        reasons: ["candidate_source" as const],
        candidateIds: ["candidate-1"],
      }],
      requirements: [{
        candidateId: "candidate-1",
        requiredCategories: ["candidate_source", "security_defense"],
        requiredFiles: ["src/auth/check.ts"],
        unresolvedReference: false,
      }],
    };

    expect(assessTargetedSecurityEvidence(plan, plan.candidates)).toEqual({
      completeCandidateIds: [],
      incompleteCandidateIds: ["candidate-1"],
      missingByCandidate: { "candidate-1": ["security_defense"] },
    });
  });

  it("keeps unresolved aliases and dynamic calls incomplete", () => {
    const plan = planTargetedSecurityEvidence({
      findings: [{
        candidateId: "candidate-1",
        file: "lib/workers/review.ts",
        severity: "high",
        category: "security",
      }],
      changedFiles: [changedFile(
        "lib/workers/review.ts",
        [
          'import "@/lib/security/identity";',
          'const helper = import("./dynamic-defense");',
        ].join("\n"),
      )],
      fullFileContext: [],
      relatedCodeContext: [],
      repositoryPaths: [
        "lib/workers/review.ts",
        "lib/security/identity.ts",
        "lib/dynamic-defense.ts",
      ],
      maxFiles: 6,
      requestBudget: 6,
    });

    expect(plan.candidates.find((candidate) => candidate.file === "lib/security/identity.ts")?.reasons)
      .not.toContain("direct_callee");
    const assessment = assessTargetedSecurityEvidence(plan, plan.candidates);
    expect(assessment.incompleteCandidateIds).toContain("candidate-1");
  });

  it.each([
    ["PR61-global-repository-id", "lib/db/queries.ts", "repositoryId installationId"],
    ["PR63-worker-authorization", "lib/workers/review.ts", "actor installation"],
    ["PR64-review-cap", "lib/db/queries.ts", "count insert"],
  ])("routes %s claims to bounded repository evidence", (_name, file, source) => {
    const sourceText = _name === "PR63-worker-authorization"
      ? `${source}\nimport "../github/client";`
      : source;
    const plan = planTargetedSecurityEvidence({
      findings: [{
        candidateId: "candidate-1",
        file,
        severity: "high",
        category: file.includes("review") ? "security" : "bug",
      }],
      changedFiles: [changedFile(file, sourceText)],
      fullFileContext: [{ file, content: sourceText }],
      relatedCodeContext: [],
      repositoryPaths: [
        file,
        "lib/db/schema.ts",
        "drizzle/0013_known_archangel.sql",
        "lib/github/client.ts",
        "tests/review.test.ts",
        "context/architecture.md",
      ],
      maxFiles: 6,
      requestBudget: 6,
    });

    const files = plan.candidates.map((candidate) => candidate.file);
    expect(files).toContain("context/architecture.md");
    if (_name === "PR63-worker-authorization") {
      expect(files).toContain("lib/github/client.ts");
    } else {
      expect(files.some((path) => path.includes("schema") || path.includes("migration"))).toBe(true);
    }
  });
});
