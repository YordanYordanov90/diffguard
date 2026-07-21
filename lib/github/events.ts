import { z } from "zod";

const shaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/, "Expected a 40-character hexadecimal SHA.");

const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1),
});

const installationIdSchema = z.object({
  id: z.number().int().positive(),
});

export const pullRequestEventSchema = z.object({
  action: z.string(),
  installation: installationIdSchema,
  repository: repositorySchema,
  pull_request: z.object({
    number: z.number().int().positive(),
    draft: z.boolean(),
    title: z.string(),
    body: z.string().nullable(),
    head: z.object({ sha: shaSchema }),
    user: z.object({
      login: z.string().min(1),
      type: z.string().min(1),
    }),
  }),
});

export const installationEventSchema = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number().int().positive(),
    account: z.object({
      login: z.string().min(1),
      type: z.string().min(1),
    }),
  }),
  repositories: z.array(repositorySchema).optional(),
});

export const installationRepositoriesEventSchema = z.object({
  action: z.enum(["added", "removed"]),
  installation: installationIdSchema,
  repositories_added: z.array(repositorySchema),
  repositories_removed: z.array(repositorySchema),
});

export type PullRequestEvent = z.infer<typeof pullRequestEventSchema>;
export type InstallationEvent = z.infer<typeof installationEventSchema>;
export type InstallationRepositoriesEvent = z.infer<
  typeof installationRepositoriesEventSchema
>;
