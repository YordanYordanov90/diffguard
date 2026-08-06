import type { EvaluationFixture, RecordedEvaluationResult } from "./schema";

export type EvaluationStageRun = {
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

export type EvaluationPipelineRunner = {
  candidate: (fixture: EvaluationFixture) => Promise<EvaluationStageRun & { candidateCount: number }>;
  adjudication: (fixture: EvaluationFixture, candidate: EvaluationStageRun) => Promise<EvaluationStageRun & {
    decision: RecordedEvaluationResult["adjudication"];
    reason: string;
  }>;
  targetedEvidence: (
    fixture: EvaluationFixture,
    candidate: EvaluationStageRun,
    adjudication: EvaluationStageRun,
  ) => Promise<EvaluationStageRun & { status: RecordedEvaluationResult["evidence"] }>;
  verification: (
    fixture: EvaluationFixture,
    candidate: EvaluationStageRun,
    adjudication: EvaluationStageRun,
    evidence: EvaluationStageRun,
  ) => Promise<EvaluationStageRun & {
    decision: RecordedEvaluationResult["verification"];
    reason: string;
  }>;
  finalize: (
    fixture: EvaluationFixture,
    stages: {
      candidate: EvaluationStageRun;
      adjudication: EvaluationStageRun;
      targetedEvidence: EvaluationStageRun;
      verification: EvaluationStageRun;
    },
  ) => Promise<{
    finalFindings: RecordedEvaluationResult["finalFindings"];
    duplicateRootCauses: number;
    malformedPublicationAttempts: number;
  }>;
  model: string;
};

export async function runEvaluationStages(
  fixture: EvaluationFixture,
  runner: EvaluationPipelineRunner,
): Promise<RecordedEvaluationResult> {
  const candidate = await runner.candidate(fixture);
  const adjudication = await runner.adjudication(fixture, candidate);
  const targetedEvidence = await runner.targetedEvidence(fixture, candidate, adjudication);
  const verification = await runner.verification(
    fixture,
    candidate,
    adjudication,
    targetedEvidence,
  );
  const final = await runner.finalize(fixture, {
    candidate,
    adjudication,
    targetedEvidence,
    verification,
  });
  return {
    fixtureId: fixture.id,
    candidateCount: candidate.candidateCount,
    adjudication: adjudication.decision,
    evidence: targetedEvidence.status,
    verification: verification.decision,
    finalFindings: final.finalFindings,
    adjudicationReason: adjudication.reason,
    verificationReason: verification.reason,
    duplicateRootCauses: final.duplicateRootCauses,
    malformedPublicationAttempts: final.malformedPublicationAttempts,
    stages: {
      candidate,
      adjudication,
      targetedEvidence,
      verification,
    },
    model: runner.model,
  };
}
