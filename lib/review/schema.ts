import { z } from "zod";

export const severitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const categorySchema = z.enum([
  "security",
  "bug",
  "quality",
  "performance",
]);

export const verdictSchema = z.enum(["approve", "comment", "concerns"]);

export const findingConfidenceSchema = z.enum(["low", "medium", "high"]);

export const findingDecisionSchema = z.enum([
  "confirmed",
  "rejected",
  "manual_verification",
]);

export const findingLifecycleSchema = z.enum(["open", "resolved", "dismissed"]);

export const findingUpdateStatusSchema = z.enum(["open", "resolved"]);

export const issueAssessmentStatusSchema = z.enum([
  "addressed",
  "not_addressed",
  "unclear",
]);

export const findingSchema = z.object({
  severity: severitySchema,
  category: categorySchema,
  file: z.string().min(1).max(1_000),
  line: z.number().int().nullable(),
  title: z.string().min(1).max(300),
  detail: z.string().min(1).max(8_000),
  suggestion: z.string().max(8_000).nullable(),
});

export const issueAssessmentSchema = z.object({
  issueNumber: z.number().int().positive(),
  status: issueAssessmentStatusSchema,
  rationale: z.string().min(1).max(1_000),
  unmetRequirements: z.array(z.string().min(1).max(500)).max(10),
});

/** Persistable assessment plus minimal issue metadata (never full body). */
export const persistedIssueAssessmentSchema = issueAssessmentSchema.extend({
  title: z.string().min(1).max(500),
});

export const reviewOutputSchema = z.object({
  summary: z.string().min(1).max(2_000),
  verdict: verdictSchema,
  findings: z.array(findingSchema),
});

export const suggestedChangeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  replacement: z.string().max(20_000),
});

export const findingCandidateSchema = findingSchema.extend({
  confidence: findingConfidenceSchema,
  observedBehavior: z.string().min(1).max(4_000),
  causalPath: z.string().min(1).max(4_000),
  violatedInvariant: z.string().min(1).max(4_000),
  requiresRuntimeVerification: z.boolean(),
  suggestedChange: suggestedChangeSchema.nullable(),
});

export const candidateReviewOutputSchema = z.object({
  summary: z.string().min(1).max(2_000),
  verdict: verdictSchema,
  candidates: z.array(findingCandidateSchema).max(50),
  findingUpdates: z.array(z.object({
    findingId: z.string().uuid(),
    status: findingUpdateStatusSchema,
    reason: z.string().min(1).max(1_000),
  })).max(50).default([]),
  linkedIssues: z.array(issueAssessmentSchema).max(3).default([]),
});

export const findingAdjudicationSchema = z.object({
  candidateId: z.string().min(1).max(64),
  decision: findingDecisionSchema,
  reason: z.string().min(1).max(2_000),
});

export const adjudicationOutputSchema = z.object({
  summary: z.string().min(1).max(2_000),
  verdict: verdictSchema,
  decisions: z.array(findingAdjudicationSchema).max(50),
});

export const securityVerificationDecisionSchema = z.object({
  candidateId: z.string().min(1).max(64),
  decision: z.enum(["verified", "downgraded", "rejected", "manual_verification"]),
  finalSeverity: severitySchema.nullable(),
  evidenceComplete: z.boolean(),
  attackPreconditions: z.string().max(2_000).nullable(),
  trustBoundary: z.string().max(2_000).nullable(),
  exploitPath: z.string().max(4_000).nullable(),
  impact: z.string().max(2_000).nullable(),
  defensesChecked: z.array(z.string().min(1).max(500)).max(12),
  missingEvidence: z.array(z.string().min(1).max(500)).max(12),
  reason: z.string().max(2_000),
  duplicateOfCandidateId: z.string().max(64).nullable().default(null),
});

export const securityVerificationOutputSchema = z.object({
  decisions: z.array(securityVerificationDecisionSchema).max(50),
});

/** Confirmed finding with evidence fields after Feature 24 adjudication. */
export const confirmedFindingSchema = findingCandidateSchema.extend({
  requiresRuntimeVerification: z.literal(false),
});

export const persistedSuggestedChangeSchema = suggestedChangeSchema.nullable();

export type Severity = z.infer<typeof severitySchema>;
export type Category = z.infer<typeof categorySchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type FindingConfidence = z.infer<typeof findingConfidenceSchema>;
export type FindingDecision = z.infer<typeof findingDecisionSchema>;
export type FindingLifecycle = z.infer<typeof findingLifecycleSchema>;
export type FindingUpdateStatus = z.infer<typeof findingUpdateStatusSchema>;
export type FindingUpdate = z.infer<typeof candidateReviewOutputSchema>["findingUpdates"][number];
export type IssueAssessmentStatus = z.infer<typeof issueAssessmentStatusSchema>;
export type IssueAssessment = z.infer<typeof issueAssessmentSchema>;
export type PersistedIssueAssessment = z.infer<typeof persistedIssueAssessmentSchema>;
export type SuggestedChange = z.infer<typeof suggestedChangeSchema>;
export type FindingCandidate = z.infer<typeof findingCandidateSchema>;
export type ConfirmedFinding = z.infer<typeof confirmedFindingSchema>;
export type CandidateReviewOutput = z.infer<typeof candidateReviewOutputSchema>;
export type FindingAdjudication = z.infer<typeof findingAdjudicationSchema>;
export type AdjudicationOutput = z.infer<typeof adjudicationOutputSchema>;
export type SecurityVerificationDecision = z.infer<typeof securityVerificationDecisionSchema>;
export type SecurityVerificationOutput = z.infer<typeof securityVerificationOutputSchema>;

/** Feature 34 PR chat structured response. */
export const chatReferenceSchema = z.object({
  file: z.string().min(1).max(1_000),
  line: z.number().int().positive().nullable(),
});

export const chatResponseSchema = z.object({
  answer: z.string().min(1).max(4_000),
  references: z.array(chatReferenceSchema).max(10).default([]),
});

export type ChatReference = z.infer<typeof chatReferenceSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
