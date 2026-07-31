import { z } from "zod";

export const conversationJobSchema = z.object({
  installationId: z.number().int().positive(),
  repositoryId: z.number().int().positive(),
  repoFullName: z.string().min(1),
  prNumber: z.number().int().positive(),
  /** GitHub issue comment id — idempotency key for pr_interactions. */
  sourceCommentId: z.number().int().positive(),
  actorLogin: z.string().min(1).max(100),
  prAuthorLogin: z.string().min(1).max(100),
  deliveryId: z.string().min(1),
  interactionId: z.string().uuid(),
});

export type ConversationJob = z.infer<typeof conversationJobSchema>;
