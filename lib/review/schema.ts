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

export const findingSchema = z.object({
  severity: severitySchema,
  category: categorySchema,
  file: z.string().min(1),
  line: z.number().int().nullable(),
  title: z.string().min(1),
  detail: z.string().min(1),
  suggestion: z.string().nullable(),
});

export const reviewOutputSchema = z.object({
  summary: z.string().min(1),
  verdict: verdictSchema,
  findings: z.array(findingSchema),
});

export type Severity = z.infer<typeof severitySchema>;
export type Category = z.infer<typeof categorySchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
