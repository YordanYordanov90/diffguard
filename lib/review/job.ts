import { z } from "zod";

const shaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/, "Expected a 40-character hexadecimal SHA.");

export const reviewJobSchema = z.object({
  installationId: z.number().int().positive(),
  repositoryId: z.number().int().positive(),
  repoFullName: z.string().min(1),
  prNumber: z.number().int().positive(),
  headSha: shaSchema,
  deliveryId: z.string().min(1),
});

export type ReviewJob = z.infer<typeof reviewJobSchema>;
