import { z } from "zod";

import { FEEDBACK_REASON_MAX_CHARS } from "@/lib/config/constants";

export const feedbackActionSchema = z.enum(["valid", "dismiss", "false_positive"]);

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
  action: feedbackActionSchema,
  reason: z.string().min(1).max(FEEDBACK_REASON_MAX_CHARS).nullable(),
  deliveryId: z.string().min(1),
});

export type FeedbackJob = z.infer<typeof feedbackJobSchema>;
export type FeedbackAction = z.infer<typeof feedbackActionSchema>;
