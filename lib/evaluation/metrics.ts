import type {
  EvaluationFixture,
  EvaluationManifest,
  RecordedEvaluationResult,
} from "./schema";
import { parseEvaluationManifest, parseRecordedEvaluationResults } from "./validation";

export type RateMetric = {
  numerator: number;
  denominator: number;
  rate: number | null;
};

export type EvaluationStageMetric = {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  fixtureCount: number;
};

export type EvaluationReport = {
  version: string;
  fixtureCount: number;
  publishedFindingCount: number;
  actionablePrecision: RateMetric;
  highCriticalPrecision: RateMetric;
  falsePositiveRate: RateMetric;
  optionalHardeningRate: RateMetric;
  severityOverstatementRate: RateMetric;
  duplicateRootCauseRate: RateMetric;
  incompleteEvidencePublicationAttempts: number;
  malformedPublicationAttempts: number;
  knownFalseSeverePublicationAttempts: number;
  candidateRejectionReasons: Record<string, number>;
  verificationDowngradeReasons: Record<string, number>;
  byCategory: Record<string, RateMetric>;
  bySeverity: Record<string, RateMetric>;
  stages: Record<"candidate" | "adjudication" | "targetedEvidence" | "verification", EvaluationStageMetric>;
  regressionFailures: string[];
  results: Array<{
    fixtureId: string;
    expectedLabel: EvaluationFixture["label"];
    published: boolean;
    finalSeverities: string[];
    verification: RecordedEvaluationResult["verification"];
  }>;
};

export type ReleaseGate = {
  name: string;
  status: "passed" | "failed" | "not_meaningful";
  value: number | null;
  threshold: number | null;
  detail: string;
};

export type ReleaseGateReport = {
  passed: boolean;
  gates: ReleaseGate[];
};

const USEFUL_LABELS = new Set(["actionable_defect", "optional_hardening"]);
const NEGATIVE_LABELS = new Set([
  "intentional_behavior",
  "false_positive",
  "policy_question",
  "duplicate",
  "severity_overstated",
]);
const SEVERE = new Set(["critical", "high"]);
const REQUIRED_REGRESSIONS = [
  "pr38-mobile-siblings",
  "pr38-coverage-rail",
  "pr61-global-repository-id",
  "pr63-worker-authorization",
  "pr64-review-cap",
];

function rate(numerator: number, denominator: number): RateMetric {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function emptyStage(): EvaluationStageMetric {
  return { inputTokens: 0, outputTokens: 0, durationMs: 0, fixtureCount: 0 };
}

function addStage(
  totals: EvaluationStageMetric,
  result: ReturnType<typeof stageResult>,
): void {
  totals.inputTokens += result.inputTokens;
  totals.outputTokens += result.outputTokens;
  totals.durationMs += result.durationMs;
  totals.fixtureCount += 1;
}

function stageResult(result: RecordedEvaluationResult, stage: keyof RecordedEvaluationResult["stages"]) {
  return result.stages[stage];
}

function fixtureById(manifest: EvaluationManifest): Map<string, EvaluationFixture> {
  return new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
}

function regressionFailure(
  fixture: EvaluationFixture,
  result: RecordedEvaluationResult,
): boolean {
  const published = result.finalFindings.length > 0;
  if (fixture.expected.published !== published) return true;
  const expectedVerification = fixture.expected.verification === "not_applicable"
    ? "not_run"
    : fixture.expected.verification;
  if (expectedVerification !== result.verification) return true;
  if (!fixture.expected.published) return false;
  return !result.finalFindings.some(
    (finding) => finding.rootCauseKey === fixture.expected.rootCauseKey &&
      finding.severity === fixture.expected.finalSeverity,
  );
}

export function computeEvaluationReport(
  manifestInput: unknown,
  resultsInput: unknown,
  expectedFixtureCount = 29,
): EvaluationReport {
  const manifest = parseEvaluationManifest(manifestInput, expectedFixtureCount);
  const results = parseRecordedEvaluationResults(resultsInput, manifest);
  const fixtures = fixtureById(manifest);
  const candidateRejectionReasons: Record<string, number> = {};
  const verificationDowngradeReasons: Record<string, number> = {};
  const byCategory: Record<string, RateMetric> = {};
  const bySeverity: Record<string, RateMetric> = {};
  const categoryPublished: Record<string, number> = {};
  const categoryUseful: Record<string, number> = {};
  const severityPublished: Record<string, number> = {};
  const severityUseful: Record<string, number> = {};
  const stages = {
    candidate: emptyStage(),
    adjudication: emptyStage(),
    targetedEvidence: emptyStage(),
    verification: emptyStage(),
  };
  let publishedFindingCount = 0;
  let usefulPublished = 0;
  let severePublished = 0;
  let correctSeverePublished = 0;
  let negativePublished = 0;
  let optionalPublished = 0;
  let optionalCount = 0;
  let severityOverstated = 0;
  let severityOverstatedCount = 0;
  let duplicateRoots = 0;
  let incompleteEvidencePublicationAttempts = 0;
  let malformedPublicationAttempts = 0;
  let knownFalseSeverePublicationAttempts = 0;
  const regressionFailures: string[] = [];
  const reportResults: EvaluationReport["results"] = [];

  for (const result of results.results) {
    const fixture = fixtures.get(result.fixtureId);
    if (!fixture) throw new Error(`Missing fixture for result: ${result.fixtureId}`);
    const published = result.finalFindings.length > 0;
    const useful = USEFUL_LABELS.has(fixture.label);
    const negative = NEGATIVE_LABELS.has(fixture.label);
    if (published) {
      publishedFindingCount += result.finalFindings.length;
      if (useful) usefulPublished += result.finalFindings.length;
      if (negative) negativePublished += result.finalFindings.length;
      for (const finding of result.finalFindings) {
        increment(categoryPublished, fixture.domain);
        if (useful) increment(categoryUseful, fixture.domain);
        increment(severityPublished, finding.severity);
        if (useful) increment(severityUseful, finding.severity);
        if (SEVERE.has(finding.severity)) {
          severePublished += 1;
          if (negative) knownFalseSeverePublicationAttempts += 1;
          if (useful && finding.severity === fixture.expected.finalSeverity) correctSeverePublished += 1;
        }
        if (!finding.evidenceComplete) incompleteEvidencePublicationAttempts += 1;
      }
    }
    if (fixture.label === "optional_hardening") {
      optionalCount += 1;
      if (published) optionalPublished += 1;
    }
    if (fixture.label === "severity_overstated") {
      severityOverstatedCount += 1;
      if (result.finalFindings.some((finding) => SEVERE.has(finding.severity))) severityOverstated += 1;
    }
    if (result.verification === "downgraded") increment(verificationDowngradeReasons, result.verificationReason);
    if (result.adjudication === "rejected" || result.adjudication === "manual_verification") {
      increment(candidateRejectionReasons, result.adjudicationReason);
    }
    duplicateRoots += result.duplicateRootCauses;
    malformedPublicationAttempts += result.malformedPublicationAttempts;
    addStage(stages.candidate, stageResult(result, "candidate"));
    addStage(stages.adjudication, stageResult(result, "adjudication"));
    addStage(stages.targetedEvidence, stageResult(result, "targetedEvidence"));
    addStage(stages.verification, stageResult(result, "verification"));
    if (REQUIRED_REGRESSIONS.includes(fixture.id) && regressionFailure(fixture, result)) {
      regressionFailures.push(fixture.id);
    }
    reportResults.push({
      fixtureId: fixture.id,
      expectedLabel: fixture.label,
      published,
      finalSeverities: result.finalFindings.map((finding) => finding.severity),
      verification: result.verification,
    });
  }

  for (const category of Object.keys(categoryPublished).sort()) {
    byCategory[category] = rate(categoryUseful[category] ?? 0, categoryPublished[category] ?? 0);
  }
  for (const severity of Object.keys(severityPublished).sort()) {
    bySeverity[severity] = rate(severityUseful[severity] ?? 0, severityPublished[severity] ?? 0);
  }

  return {
    version: manifest.version,
    fixtureCount: manifest.fixtures.length,
    publishedFindingCount,
    actionablePrecision: rate(usefulPublished, publishedFindingCount),
    highCriticalPrecision: rate(correctSeverePublished, severePublished),
    falsePositiveRate: rate(negativePublished, manifest.fixtures.filter((fixture) => NEGATIVE_LABELS.has(fixture.label)).length),
    optionalHardeningRate: rate(optionalPublished, optionalCount),
    severityOverstatementRate: rate(severityOverstated, severityOverstatedCount),
    duplicateRootCauseRate: rate(duplicateRoots, publishedFindingCount + duplicateRoots),
    incompleteEvidencePublicationAttempts,
    malformedPublicationAttempts,
    knownFalseSeverePublicationAttempts,
    candidateRejectionReasons,
    verificationDowngradeReasons,
    byCategory,
    bySeverity,
    stages,
    regressionFailures,
    results: reportResults,
  };
}

export function evaluateReleaseGates(
  report: EvaluationReport,
  options: { minimumSevereFixtures?: number; minimumHighCriticalPrecision?: number } = {},
): ReleaseGateReport {
  const minimumSevereFixtures = options.minimumSevereFixtures ?? 4;
  const minimumPrecision = options.minimumHighCriticalPrecision ?? 0.9;
  const severeFixtures = report.results.filter((result) =>
    result.finalSeverities.some((severity) => SEVERE.has(severity)),
  ).length;
  const gates: ReleaseGate[] = [
    {
      name: "known_false_severe_rejected_or_downgraded",
      status: report.knownFalseSeverePublicationAttempts === 0
        ? "passed" : "failed",
      value: report.knownFalseSeverePublicationAttempts,
      threshold: 0,
      detail: "Severity-overstated fixtures must not publish a high/critical finding.",
    },
    {
      name: "high_critical_precision",
      status: severeFixtures < minimumSevereFixtures
        ? "not_meaningful"
        : report.highCriticalPrecision.rate !== null && report.highCriticalPrecision.rate >= minimumPrecision
          ? "passed" : "failed",
      value: report.highCriticalPrecision.rate,
      threshold: minimumPrecision,
      detail: `Requires at least ${minimumSevereFixtures} severe fixtures before applying the precision threshold.`,
    },
    {
      name: "incomplete_evidence_publication",
      status: report.incompleteEvidencePublicationAttempts === 0 ? "passed" : "failed",
      value: report.incompleteEvidencePublicationAttempts,
      threshold: 0,
      detail: "No finding with incomplete targeted evidence may be published.",
    },
    {
      name: "duplicate_root_cause_rate",
      status: report.duplicateRootCauseRate.rate !== null && report.duplicateRootCauseRate.rate < 0.05
        ? "passed" : "failed",
      value: report.duplicateRootCauseRate.rate,
      threshold: 0.05,
      detail: "Duplicate root causes must remain below five percent of final findings.",
    },
    {
      name: "regression_expectations",
      status: report.regressionFailures.length === 0 ? "passed" : "failed",
      value: report.regressionFailures.length,
      threshold: 0,
      detail: "PR #38, #61, #63, and #64 expectations must remain stable.",
    },
    {
      name: "malformed_output_publication",
      status: report.malformedPublicationAttempts === 0 ? "passed" : "failed",
      value: report.malformedPublicationAttempts,
      threshold: 0,
      detail: "Malformed structured output must fail closed.",
    },
  ];
  return { passed: gates.every((gate) => gate.status !== "failed"), gates };
}
