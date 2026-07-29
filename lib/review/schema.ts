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

export const findingSchema = z.object({
  severity: severitySchema,
  category: categorySchema,
  file: z.string().min(1).max(1_000),
  line: z.number().int().nullable(),
  title: z.string().min(1).max(300),
  detail: z.string().min(1).max(8_000),
  suggestion: z.string().max(8_000).nullable(),
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
export type SuggestedChange = z.infer<typeof suggestedChangeSchema>;
export type FindingCandidate = z.infer<typeof findingCandidateSchema>;
export type ConfirmedFinding = z.infer<typeof confirmedFindingSchema>;
export type CandidateReviewOutput = z.infer<typeof candidateReviewOutputSchema>;
export type FindingAdjudication = z.infer<typeof findingAdjudicationSchema>;
export type AdjudicationOutput = z.infer<typeof adjudicationOutputSchema>;
