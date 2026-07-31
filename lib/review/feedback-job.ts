import { z } from "zod";

import {
  FEEDBACK_REASON_MAX_CHARS,
  LEARNING_GUIDANCE_MAX_CHARS,
} from "@/lib/config/constants";

/** Persisted finding_feedback actions (Feature 30). */
export const feedbackActionSchema = z.enum([
  "valid",
  "dismiss",
  "false_positive",
]);

/** Job actions include remember (Feature 31), which creates a learning only. */
export const feedbackJobActionSchema = z.enum([
  "valid",
  "dismiss",
  "false_positive",
  "remember",
]);

const reasonMaxChars = Math.max(
  FEEDBACK_REASON_MAX_CHARS,
  LEARNING_GUIDANCE_MAX_CHARS,
);

export const feedbackJobSchema = z.object({
  installationId: z.number().int().positive(),
  repositoryId: z.number().int().positive(),
  repoFullName: z.string().min(1),
  prNumber: z.number().int().positive(),
  /** Parent inline comment that must map to a DiffGuard finding. */
  parentCommentId: z.number().int().positive(),
  /** Reply comment that issued the command (idempotency key). */
  sourceCommentId: z.number().int().positive(),
  actorLogin: z.string().min(1).max(100),
  prAuthorLogin: z.string().min(1).max(100),
  action: feedbackJobActionSchema,
  reason: z.string().min(1).max(reasonMaxChars).nullable(),
  deliveryId: z.string().min(1),
});

export type FeedbackJob = z.infer<typeof feedbackJobSchema>;
export type FeedbackAction = z.infer<typeof feedbackActionSchema>;
export type FeedbackJobAction = z.infer<typeof feedbackJobActionSchema>;
