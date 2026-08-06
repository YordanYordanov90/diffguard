import { z } from "zod";

import { severitySchema } from "@/lib/review/schema";

export const evaluationLabelSchema = z.enum([
  "actionable_defect",
  "optional_hardening",
  "intentional_behavior",
  "false_positive",
  "policy_question",
  "duplicate",
  "severity_overstated",
]);

export const evaluationDomainSchema = z.enum([
  "authorization",
  "tenant_scoping",
  "prompt_injection",
  "migration",
  "quota_race",
  "retry_idempotency",
  "accessibility",
  "parser",
  "product_policy",
]);

export const evaluationSourceFixtureSchema = z.object({
  path: z.string().regex(/^[a-zA-Z0-9._/-]+$/).max(300),
  content: z.string().min(1).max(12_000),
});

export const evaluationExpectedOutcomeSchema = z.object({
  candidate: z.enum(["candidate", "none"]),
  adjudication: z.enum(["confirmed", "rejected", "manual_verification"]),
  evidence: z.enum(["complete", "incomplete", "not_applicable"]),
  verification: z.enum([
    "verified",
    "downgraded",
    "rejected",
    "manual_verification",
    "not_applicable",
  ]),
  finalSeverity: severitySchema.nullable(),
  published: z.boolean(),
  rootCauseKey: z.string().regex(/^[a-z0-9-]+$/).max(100).nullable(),
});

export const evaluationFixtureSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]+$/).max(100),
  label: evaluationLabelSchema,
  domain: evaluationDomainSchema,
  source: evaluationSourceFixtureSchema,
  expected: evaluationExpectedOutcomeSchema,
});

export const evaluationManifestSchema = z.object({
  version: z.string().regex(/^v\d+$/).max(20),
  fixtures: z.array(evaluationFixtureSchema).min(1).max(64),
});

const stageTimingSchema = z.object({
  inputTokens: z.number().int().nonnegative().max(100_000),
  outputTokens: z.number().int().nonnegative().max(20_000),
  durationMs: z.number().int().nonnegative().max(300_000),
});

const recordedFindingSchema = z.object({
  severity: severitySchema,
  rootCauseKey: z.string().regex(/^[a-z0-9-]+$/).max(100),
  evidenceComplete: z.boolean(),
});

export const recordedEvaluationResultSchema = z.object({
  fixtureId: z.string().regex(/^[a-z0-9][a-z0-9-]+$/).max(100),
  candidateCount: z.number().int().nonnegative().max(50),
  adjudication: z.enum(["confirmed", "rejected", "manual_verification", "not_run"]),
  evidence: z.enum(["complete", "incomplete", "not_run"]),
  verification: z.enum([
    "verified",
    "downgraded",
    "rejected",
    "manual_verification",
    "not_run",
  ]),
  finalFindings: z.array(recordedFindingSchema).max(20),
  adjudicationReason: z.string().max(1_000),
  verificationReason: z.string().max(1_000),
  duplicateRootCauses: z.number().int().nonnegative().max(20),
  malformedPublicationAttempts: z.number().int().nonnegative().max(20),
  stages: z.object({
    candidate: stageTimingSchema,
    adjudication: stageTimingSchema,
    targetedEvidence: stageTimingSchema,
    verification: stageTimingSchema,
  }),
  model: z.string().min(1).max(200),
});

export const recordedEvaluationResultsSchema = z.object({
  version: z.string().regex(/^v\d+$/).max(20),
  results: z.array(recordedEvaluationResultSchema).min(1).max(64),
});

export type EvaluationLabel = z.infer<typeof evaluationLabelSchema>;
export type EvaluationDomain = z.infer<typeof evaluationDomainSchema>;
export type EvaluationFixture = z.infer<typeof evaluationFixtureSchema>;
export type EvaluationManifest = z.infer<typeof evaluationManifestSchema>;
export type RecordedEvaluationResult = z.infer<typeof recordedEvaluationResultSchema>;
export type RecordedEvaluationResults = z.infer<typeof recordedEvaluationResultsSchema>;
