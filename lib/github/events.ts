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

/**
 * Minimal fields for Feature 30 feedback signals.
 * Only newly created replies are processed; edits/deletes are ignored.
 */
export const pullRequestReviewCommentEventSchema = z.object({
  action: z.string(),
  installation: installationIdSchema,
  repository: repositorySchema,
  pull_request: z.object({
    number: z.number().int().positive(),
    user: z.object({
      login: z.string().min(1),
      type: z.string().min(1),
    }),
  }),
  comment: z.object({
    id: z.number().int().positive(),
    body: z.string(),
    user: z.object({
      login: z.string().min(1),
      type: z.string().min(1),
    }),
    /** Present only for replies; top-level inline comments are ignored. */
    in_reply_to_id: z.number().int().positive().nullable().optional(),
  }),
});

export type PullRequestEvent = z.infer<typeof pullRequestEventSchema>;
export type InstallationEvent = z.infer<typeof installationEventSchema>;
export type InstallationRepositoriesEvent = z.infer<
  typeof installationRepositoriesEventSchema
>;
export type PullRequestReviewCommentEvent = z.infer<
  typeof pullRequestReviewCommentEventSchema
>;

/**
 * Minimal fields for Feature 33 PR conversation boundary.
 * Only newly created comments on pull-request issues are processed.
 */
export const issueCommentEventSchema = z.object({
  action: z.string(),
  installation: installationIdSchema,
  repository: repositorySchema,
  issue: z.object({
    number: z.number().int().positive(),
    /** Present only when the issue is a pull request. */
    pull_request: z
      .object({
        url: z.string().url().optional(),
      })
      .passthrough()
      .optional(),
    user: z.object({
      login: z.string().min(1),
      type: z.string().min(1),
    }),
  }),
  comment: z.object({
    id: z.number().int().positive(),
    body: z.string(),
    user: z.object({
      login: z.string().min(1),
      type: z.string().min(1),
    }),
  }),
});

export type IssueCommentEvent = z.infer<typeof issueCommentEventSchema>;

export function issueCommentIsPullRequest(
  event: Pick<IssueCommentEvent, "issue">,
): boolean {
  return event.issue.pull_request !== undefined;
}
