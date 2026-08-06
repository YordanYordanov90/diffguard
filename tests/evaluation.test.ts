import { describe, expect, it } from "vitest";

import manifest from "@/evaluation/manifest.json";
import recordedResults from "@/evaluation/recorded-results.json";
import {
  computeEvaluationReport,
  evaluateReleaseGates,
} from "@/lib/evaluation/metrics";
import { runEvaluationStages } from "@/lib/evaluation/runner";
import {
  parseEvaluationManifest,
  parseRecordedEvaluationResults,
} from "@/lib/evaluation/validation";

describe("review quality evaluation", () => {
  it("validates the versioned sanitized manifest and recorded outputs", () => {
    const parsedManifest = parseEvaluationManifest(manifest);
    const parsedResults = parseRecordedEvaluationResults(recordedResults, parsedManifest);

    expect(parsedManifest.fixtures).toHaveLength(29);
    expect(parsedResults.results).toHaveLength(29);
    expect(new Set(parsedManifest.fixtures.map((fixture) => fixture.id)).size).toBe(29);
  });

  it("rejects private-source markers and duplicate fixture ids", () => {
    const duplicate = {
      ...manifest,
      fixtures: [manifest.fixtures[0], ...manifest.fixtures.slice(1), manifest.fixtures[0]],
    };
    expect(() => parseEvaluationManifest(duplicate)).toThrow(/Duplicate/);

    const privateSource = {
      ...manifest,
      fixtures: manifest.fixtures.map((fixture, index) => index === 0
        ? { ...fixture, source: { ...fixture.source, content: "private repository source" } }
        : fixture),
    };
    expect(() => parseEvaluationManifest(privateSource)).toThrow(/Private-source/);
  });

  it("computes deterministic metrics and passes the calibrated release gates", () => {
    const report = computeEvaluationReport(manifest, recordedResults);
    const gates = evaluateReleaseGates(report);

    expect(report.fixtureCount).toBe(29);
    expect(report.publishedFindingCount).toBe(13);
    expect(report.actionablePrecision).toEqual({ numerator: 12, denominator: 13, rate: 12 / 13 });
    expect(report.highCriticalPrecision.rate).toBe(1);
    expect(report.knownFalseSeverePublicationAttempts).toBe(0);
    expect(report.incompleteEvidencePublicationAttempts).toBe(0);
    expect(report.malformedPublicationAttempts).toBe(0);
    expect(report.regressionFailures).toEqual([]);
    expect(gates.passed).toBe(true);
    expect(gates.gates.every((gate) => gate.status !== "failed")).toBe(true);
  });

  it("fails the release gate when an incomplete severe finding is published", () => {
    const broken = {
      ...recordedResults,
      results: recordedResults.results.map((result) => result.fixtureId === "tenant-filter-missing"
        ? {
            ...result,
            finalFindings: [{
              severity: "critical" as const,
              rootCauseKey: "missing-installation-scope",
              evidenceComplete: false,
            }],
          }
        : result),
    };
    const gates = evaluateReleaseGates(computeEvaluationReport(manifest, broken));
    expect(gates.passed).toBe(false);
    expect(gates.gates.find((gate) => gate.name === "incomplete_evidence_publication")?.status)
      .toBe("failed");
  });

  it("runs the four evaluation stages in order without production side effects", async () => {
    const fixture = parseEvaluationManifest(manifest).fixtures[0];
    const calls: string[] = [];
    const stage = (name: string) => {
      calls.push(name);
      return { output: { name }, inputTokens: 1, outputTokens: 1, durationMs: 1 };
    };
    const result = await runEvaluationStages(fixture, {
      model: "recorded/test-model",
      candidate: async () => ({ ...stage("candidate"), candidateCount: 1 }),
      adjudication: async () => ({ ...stage("adjudication"), decision: "rejected", reason: "fixture" }),
      targetedEvidence: async () => ({ ...stage("targetedEvidence"), status: "not_run" }),
      verification: async () => ({ ...stage("verification"), decision: "not_run", reason: "fixture" }),
      finalize: async () => ({ finalFindings: [], duplicateRootCauses: 0, malformedPublicationAttempts: 0 }),
    });

    expect(calls).toEqual(["candidate", "adjudication", "targetedEvidence", "verification"]);
    expect(result.fixtureId).toBe(fixture.id);
    expect(result.finalFindings).toEqual([]);
  });
});
