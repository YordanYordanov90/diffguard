import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

import {
  LEARNING_GUIDANCE_MAX_CHARS,
  MAX_ACTIVE_LEARNINGS_PER_REPO,
} from "@/lib/config/constants";
import {
  computeLearningContentHash,
  isValidActiveLearning,
} from "@/lib/review/learnings";
import { db as defaultDb } from "./client";
import {
  findingFeedback,
  installations,
  repositories,
  repositoryLearnings,
  reviewFindings,
  reviews,
  type FeedbackAction,
  type ReviewMode,
  type FindingLifecycle,
  type SkipReason,
  type StoredIssueAssessment,
  type StoredSuggestedChange,
} from "./schema";

type Database = typeof defaultDb;
const RESOLUTION_REPLY_LEASE_MS = 5 * 60 * 1000;

export type InstallationInput = {
  id: number;
  accountLogin: string;
  accountType: string;
  model?: string;
};

export type RepositoryInput = {
  id: number;
  fullName: string;
};

export type QueuedReviewInput = {
  installationId: number;
  repositoryId: number;
  prNumber: number;
  headSha: string;
};

export type ReviewTarget = {
  suspended: boolean;
  enabled: boolean;
  repoFullName: string;
};

export type QueuedReviewResult = {
  review: typeof reviews.$inferSelect | null;
  created: boolean;
};

export type ReviewCompletion = {
  reviewMarkdown: string;
  verdict: "approve" | "comment" | "concerns";
  commentId: number;
  reviewMode: ReviewMode;
  comparedFromSha: string | null;
  findingsCritical: number;
  findingsHigh: number;
  findingsMedium: number;
  findingsLow: number;
  findingsInfo: number;
  candidateFindings: number;
  rejectedFindings: number;
  manualCheckCandidates: number;
  adjudicationModel: string | null;
  adjudicationDurationMs: number | null;
  linkedIssueAssessments: StoredIssueAssessment[];
  skippedFiles: string[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
};

export async function upsertInstallation(
  input: InstallationInput,
  database: Database = defaultDb,
) {
  const [installation] = await database
    .insert(installations)
    .values({
      id: input.id,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      ...(input.model ? { model: input.model } : {}),
    })
    .onConflictDoUpdate({
      target: installations.id,
      set: {
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        ...(input.model ? { model: input.model } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return installation;
}

export async function suspendInstallation(
  installationId: number,
  suspended: boolean,
  database: Database = defaultDb,
) {
  const [installation] = await database
    .update(installations)
    .set({ suspended, updatedAt: new Date() })
    .where(eq(installations.id, installationId))
    .returning();

  return installation ?? null;
}

export async function deleteInstallation(
  installationId: number,
  database: Database = defaultDb,
) {
  const [installation] = await database
    .delete(installations)
    .where(eq(installations.id, installationId))
    .returning();

  return installation ?? null;
}

export async function syncRepositories(
  installationId: number,
  added: RepositoryInput[],
  removed: RepositoryInput[],
  database: Database = defaultDb,
) {
  for (const repository of added) {
    await database
      .insert(repositories)
      .values({
        id: repository.id,
        installationId,
        fullName: repository.fullName,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: repositories.id,
        set: {
          installationId,
          fullName: repository.fullName,
          enabled: true,
        },
      });
  }

  const removedIds = removed.map((repository) => repository.id);
  if (removedIds.length > 0) {
    await database
      .delete(repositories)
      .where(
        and(
          eq(repositories.installationId, installationId),
          inArray(repositories.id, removedIds),
        ),
      );
  }
}

export async function createQueuedReview(
  input: QueuedReviewInput,
  database: Database = defaultDb,
) {
  const [repository] = await database
    .select({ id: repositories.id })
    .from(repositories)
    .where(
      and(
        eq(repositories.id, input.repositoryId),
        eq(repositories.installationId, input.installationId),
      ),
    )
    .limit(1);

  if (!repository) {
    throw new Error("Repository is not registered for this installation.");
  }

  const [createdReview] = await database
    .insert(reviews)
    .values({
      installationId: input.installationId,
      repositoryId: input.repositoryId,
      prNumber: input.prNumber,
      headSha: input.headSha,
    })
    .onConflictDoNothing({
      target: [reviews.repositoryId, reviews.prNumber, reviews.headSha],
    })
    .returning();

  if (createdReview) {
    return { review: createdReview, created: true };
  }

  const existingReview = await getReviewBySha(
    input.installationId,
    input.repositoryId,
    input.prNumber,
    input.headSha,
    database,
  );
  return { review: existingReview, created: false };
}

export async function getReviewTarget(
  installationId: number,
  repositoryId: number,
  database: Database = defaultDb,
) {
  const [target] = await database
    .select({
      suspended: installations.suspended,
      enabled: repositories.enabled,
      repoFullName: repositories.fullName,
    })
    .from(repositories)
    .innerJoin(installations, eq(installations.id, repositories.installationId))
    .where(
      and(
        eq(repositories.id, repositoryId),
        eq(repositories.installationId, installationId),
      ),
    )
    .limit(1);

  return target ?? null;
}

export async function getInstallationModel(
  installationId: number,
  database: Database = defaultDb,
) {
  const [installation] = await database
    .select({ model: installations.model })
    .from(installations)
    .where(eq(installations.id, installationId))
    .limit(1);

  return installation?.model ?? null;
}

export async function getReviewBySha(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  headSha: string,
  database: Database = defaultDb,
) {
  const [review] = await database
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.installationId, installationId),
        eq(reviews.repositoryId, repositoryId),
        eq(reviews.prNumber, prNumber),
        eq(reviews.headSha, headSha),
      ),
    )
    .limit(1);

  return review ?? null;
}

export async function getLatestReviewCommentId(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  database: Database = defaultDb,
) {
  const [review] = await database
    .select({ commentId: reviews.commentId })
    .from(reviews)
    .where(
      and(
        eq(reviews.installationId, installationId),
        eq(reviews.repositoryId, repositoryId),
        eq(reviews.prNumber, prNumber),
        eq(reviews.status, "completed"),
        isNotNull(reviews.commentId),
      ),
    )
    .orderBy(desc(reviews.updatedAt))
    .limit(1);

  return review?.commentId ?? null;
}

/**
 * Latest completed review for the same tenant, repository, and PR.
 * Used as the incremental baseline — never accept previous SHA from webhooks.
 */
export async function getLatestCompletedReviewForPr(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  database: Database = defaultDb,
) {
  const [review] = await database
    .select({
      id: reviews.id,
      headSha: reviews.headSha,
      commentId: reviews.commentId,
      updatedAt: reviews.updatedAt,
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.installationId, installationId),
        eq(reviews.repositoryId, repositoryId),
        eq(reviews.prNumber, prNumber),
        eq(reviews.status, "completed"),
      ),
    )
    .orderBy(desc(reviews.updatedAt))
    .limit(1);

  return review ?? null;
}

export async function markReviewRunning(
  installationId: number,
  reviewId: string,
  database: Database = defaultDb,
) {
  return updateReviewStatus(installationId, reviewId, "running", database);
}

export async function markReviewCompleted(
  installationId: number,
  reviewId: string,
  completion: ReviewCompletion,
  database: Database = defaultDb,
) {
  const [review] = await database
    .update(reviews)
    .set({ status: "completed", ...completion, updatedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), eq(reviews.installationId, installationId)))
    .returning();

  return review ?? null;
}

/**
 * Save the GitHub summary comment as soon as it is created so retries can
 * update it even when a later persistence step fails.
 */
export async function saveReviewCommentId(
  installationId: number,
  reviewId: string,
  commentId: number,
  database: Database = defaultDb,
) {
  const [review] = await database
    .update(reviews)
    .set({ commentId, updatedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), eq(reviews.installationId, installationId)))
    .returning();

  return review ?? null;
}

export async function markReviewFailed(
  installationId: number,
  reviewId: string,
  error: string,
  database: Database = defaultDb,
) {
  const [review] = await database
    .update(reviews)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), eq(reviews.installationId, installationId)))
    .returning();

  return review ?? null;
}

export async function markReviewSkipped(
  installationId: number,
  reviewId: string,
  skipReason: SkipReason,
  database: Database = defaultDb,
) {
  const [review] = await database
    .update(reviews)
    .set({ status: "skipped", skipReason, updatedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), eq(reviews.installationId, installationId)))
    .returning();

  return review ?? null;
}

export async function requeueReview(
  installationId: number,
  reviewId: string,
  database: Database = defaultDb,
) {
  const [review] = await database
    .update(reviews)
    .set({ status: "queued", skipReason: null, error: null, updatedAt: new Date() })
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.installationId, installationId),
        eq(reviews.status, "skipped"),
        eq(reviews.skipReason, "draft"),
      ),
    )
    .returning();

  return review ?? null;
}

async function updateReviewStatus(
  installationId: number,
  reviewId: string,
  status: "running",
  database: Database,
) {
  const [review] = await database
    .update(reviews)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(reviews.id, reviewId),
        eq(reviews.installationId, installationId),
        inArray(reviews.status, ["queued", "failed"]),
      ),
    )
    .returning();

  return review ?? null;
}

export async function countReviewsToday(
  installationId: number,
  now = new Date(),
  database: Database = defaultDb,
) {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfNextDay = new Date(startOfDay);
  startOfNextDay.setUTCDate(startOfNextDay.getUTCDate() + 1);

  const rows = await database
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.installationId, installationId),
        gte(reviews.createdAt, startOfDay),
        lt(reviews.createdAt, startOfNextDay),
        ne(reviews.status, "skipped"),
      ),
    );

  return rows.length;
}

export async function listReviews(
  installationIds: number[],
  limit: number,
  options: { repositoryId?: number } = {},
  database: Database = defaultDb,
) {
  if (installationIds.length === 0 || limit <= 0) return [];

  const conditions = [inArray(reviews.installationId, installationIds)];
  if (options.repositoryId !== undefined) {
    conditions.push(eq(reviews.repositoryId, options.repositoryId));
  }

  return database
    .select({ review: reviews, repositoryName: repositories.fullName })
    .from(reviews)
    .innerJoin(
      repositories,
      and(
        eq(repositories.id, reviews.repositoryId),
        eq(repositories.installationId, reviews.installationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

/**
 * Confirm a repository belongs to the GitHub-derived installation allowlist
 * before applying a dashboard filter. Never trust client-supplied IDs alone.
 */
export async function findAuthorizedRepository(
  installationIds: number[],
  fullName: string,
  database: Database = defaultDb,
) {
  if (installationIds.length === 0 || fullName.length === 0) return null;

  const [repository] = await database
    .select({
      id: repositories.id,
      fullName: repositories.fullName,
      installationId: repositories.installationId,
    })
    .from(repositories)
    .where(
      and(
        inArray(repositories.installationId, installationIds),
        eq(repositories.fullName, fullName),
      ),
    )
    .limit(1);

  return repository ?? null;
}

/**
 * Tenant-scoped repository inventory for dashboard coverage (Features 19–20).
 * Installation IDs must come from GitHub access resolution only.
 */
export async function listRepositoriesByInstallations(
  installationIds: number[],
  database: Database = defaultDb,
) {
  if (installationIds.length === 0) return [];

  return database
    .select({
      id: repositories.id,
      installationId: repositories.installationId,
      fullName: repositories.fullName,
      enabled: repositories.enabled,
    })
    .from(repositories)
    .where(inArray(repositories.installationId, installationIds))
    .orderBy(repositories.fullName);
}

/**
 * Latest review metadata per repository for authorized installations.
 * Uses Postgres DISTINCT ON; ordered for stable distinct selection.
 */
export async function listLatestReviewsByRepository(
  installationIds: number[],
  database: Database = defaultDb,
) {
  if (installationIds.length === 0) return [];

  return database
    .selectDistinctOn([reviews.repositoryId], {
      repositoryId: reviews.repositoryId,
      installationId: reviews.installationId,
      status: reviews.status,
      verdict: reviews.verdict,
      updatedAt: reviews.updatedAt,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(inArray(reviews.installationId, installationIds))
    .orderBy(reviews.repositoryId, desc(reviews.updatedAt));
}

/** Count non-skipped reviews created today (UTC) across authorized installations. */
export async function countReviewsTodayForInstallations(
  installationIds: number[],
  now = new Date(),
  database: Database = defaultDb,
) {
  if (installationIds.length === 0) return 0;

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfNextDay = new Date(startOfDay);
  startOfNextDay.setUTCDate(startOfNextDay.getUTCDate() + 1);

  const rows = await database
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        inArray(reviews.installationId, installationIds),
        gte(reviews.createdAt, startOfDay),
        lt(reviews.createdAt, startOfNextDay),
        ne(reviews.status, "skipped"),
      ),
    );

  return rows.length;
}

export async function getReviewDetail(
  reviewId: string,
  installationIds: number[],
  database: Database = defaultDb,
) {
  if (installationIds.length === 0) return null;

  const [result] = await database
    .select({ review: reviews, repositoryName: repositories.fullName })
    .from(reviews)
    .innerJoin(
      repositories,
      and(
        eq(repositories.id, reviews.repositoryId),
        eq(repositories.installationId, reviews.installationId),
      ),
    )
    .where(and(eq(reviews.id, reviewId), inArray(reviews.installationId, installationIds)))
    .limit(1);

  return result ?? null;
}

export type FindingUpsertInput = {
  installationId: number;
  repositoryId: number;
  prNumber: number;
  fingerprint: string;
  confidence: "low" | "medium" | "high";
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "security" | "bug" | "quality" | "performance";
  file: string;
  line: number | null;
  title: string;
  detail: string;
  observedBehavior: string;
  causalPath: string;
  violatedInvariant: string;
  suggestion: string | null;
  suggestedChange: StoredSuggestedChange | null;
  reviewId: string;
  headSha: string;
};

async function assertFindingRepository(
  input: FindingUpsertInput,
  database: Database,
) {
  const [repository] = await database
    .select({ id: repositories.id })
    .from(repositories)
    .where(
      and(
        eq(repositories.id, input.repositoryId),
        eq(repositories.installationId, input.installationId),
      ),
    )
    .limit(1);

  if (!repository) {
    throw new Error("Repository is not registered for this installation.");
  }
}

function buildFindingUpsert(
  input: FindingUpsertInput,
  database: Database,
  reopenResolved = false,
) {
  const leaseExpiredAt = new Date(Date.now() - RESOLUTION_REPLY_LEASE_MS);
  return database
    .insert(reviewFindings)
    .values({
      installationId: input.installationId,
      repositoryId: input.repositoryId,
      prNumber: input.prNumber,
      fingerprint: input.fingerprint,
      status: "open",
      confidence: input.confidence,
      severity: input.severity,
      category: input.category,
      file: input.file,
      line: input.line,
      title: input.title,
      detail: input.detail,
      observedBehavior: input.observedBehavior,
      causalPath: input.causalPath,
      violatedInvariant: input.violatedInvariant,
      suggestion: input.suggestion,
      suggestedChange: input.suggestedChange,
      introducedReviewId: input.reviewId,
      lastReviewId: input.reviewId,
      introducedSha: input.headSha,
      lastSeenSha: input.headSha,
    })
    .onConflictDoUpdate({
      target: [
        reviewFindings.repositoryId,
        reviewFindings.prNumber,
        reviewFindings.fingerprint,
      ],
      set: {
        ...(reopenResolved
          ? {
              status: "open" as const,
              previousResolvedSha: sql`${reviewFindings.resolvedSha}`,
              previousResolutionRepliedAt: sql`${reviewFindings.resolutionRepliedAt}`,
              resolvedSha: null,
              resolutionRepliedAt: null,
              resolutionReplyClaimedAt: null,
              resolutionReplyAttemptId: null,
              resolutionReplyCommentId: null,
            }
          : {}),
        confidence: input.confidence,
        severity: input.severity,
        category: input.category,
        file: input.file,
        line: input.line,
        title: input.title,
        detail: input.detail,
        observedBehavior: input.observedBehavior,
        causalPath: input.causalPath,
        violatedInvariant: input.violatedInvariant,
        suggestion: input.suggestion,
        suggestedChange: input.suggestedChange,
        lastReviewId: input.reviewId,
        lastSeenSha: input.headSha,
        updatedAt: new Date(),
      },
      setWhere: and(
        eq(reviewFindings.installationId, input.installationId),
        reopenResolved
          ? or(
              eq(reviewFindings.status, "open"),
              and(
                eq(reviewFindings.status, "resolved"),
                or(
                  isNull(reviewFindings.resolutionReplyClaimedAt),
                  lt(reviewFindings.resolutionReplyClaimedAt, leaseExpiredAt),
                ),
              ),
            )
          : eq(reviewFindings.status, "open"),
      ),
    })
    .returning();
}

/**
 * Upsert a confirmed finding by (repository, PR, fingerprint).
 * Never overwrites an existing github_comment_id.
 * Never silently reopens dismissed findings; resolved reopening is Feature 28.
 */
export async function upsertFindingByFingerprint(
  input: FindingUpsertInput,
  database: Database = defaultDb,
) {
  await assertFindingRepository(input, database);

  const [finding] = await buildFindingUpsert(input, database);

  if (finding) return finding;

  // Conflict on a non-open finding: return the existing row without mutating lifecycle.
  const [existing] = await database
    .select()
    .from(reviewFindings)
    .where(
      and(
        eq(reviewFindings.installationId, input.installationId),
        eq(reviewFindings.repositoryId, input.repositoryId),
        eq(reviewFindings.prNumber, input.prNumber),
        eq(reviewFindings.fingerprint, input.fingerprint),
      ),
    )
    .limit(1);

  return existing ?? null;
}

export async function listFindingsByReview(
  installationId: number,
  reviewId: string,
  database: Database = defaultDb,
) {
  return database
    .select()
    .from(reviewFindings)
    .where(
      and(
        eq(reviewFindings.installationId, installationId),
        eq(reviewFindings.lastReviewId, reviewId),
      ),
    )
    .orderBy(desc(reviewFindings.createdAt));
}

export async function listOpenFindingsByPr(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  database: Database = defaultDb,
) {
  return database
    .select()
    .from(reviewFindings)
    .where(
      and(
        eq(reviewFindings.installationId, installationId),
        eq(reviewFindings.repositoryId, repositoryId),
        eq(reviewFindings.prNumber, prNumber),
        eq(reviewFindings.status, "open"),
      ),
    )
    .orderBy(desc(reviewFindings.createdAt));
}

/**
 * Attach a GitHub review comment id once. Never overwrites an existing id.
 */
export async function attachFindingGitHubCommentId(
  installationId: number,
  findingId: string,
  githubCommentId: number,
  database: Database = defaultDb,
) {
  const [finding] = await database
    .update(reviewFindings)
    .set({ githubCommentId, updatedAt: new Date() })
    .where(
      and(
        eq(reviewFindings.id, findingId),
        eq(reviewFindings.installationId, installationId),
        isNull(reviewFindings.githubCommentId),
      ),
    )
    .returning();

  return finding ?? null;
}

export async function markFindingResolutionReplied(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  findingId: string,
  resolvedSha: string,
  attemptId: string,
  replyCommentId: number,
  database: Database = defaultDb,
) {
  const now = new Date();
  const [finding] = await database
    .update(reviewFindings)
    .set({
      resolutionRepliedAt: now,
      resolutionReplyClaimedAt: null,
      resolutionReplyAttemptId: null,
      resolutionReplyCommentId: replyCommentId,
      updatedAt: now,
    })
    .where(
      and(
        eq(reviewFindings.id, findingId),
        eq(reviewFindings.installationId, installationId),
        eq(reviewFindings.repositoryId, repositoryId),
        eq(reviewFindings.prNumber, prNumber),
        eq(reviewFindings.status, "resolved"),
        eq(reviewFindings.resolvedSha, resolvedSha),
        eq(reviewFindings.resolutionReplyAttemptId, attemptId),
        isNull(reviewFindings.resolutionRepliedAt),
        isNotNull(reviewFindings.resolutionReplyClaimedAt),
      ),
    )
    .returning();
  return finding ?? null;
}

export async function claimFindingResolutionReply(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  findingId: string,
  resolvedSha: string,
  attemptId: string,
  database: Database = defaultDb,
) {
  const leaseExpiredAt = new Date(Date.now() - RESOLUTION_REPLY_LEASE_MS);
  const [finding] = await database
    .update(reviewFindings)
    .set({
      resolutionReplyClaimedAt: new Date(),
      resolutionReplyAttemptId: attemptId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviewFindings.id, findingId),
        eq(reviewFindings.installationId, installationId),
        eq(reviewFindings.repositoryId, repositoryId),
        eq(reviewFindings.prNumber, prNumber),
        eq(reviewFindings.status, "resolved"),
        eq(reviewFindings.resolvedSha, resolvedSha),
        isNull(reviewFindings.resolutionRepliedAt),
        or(
          isNull(reviewFindings.resolutionReplyClaimedAt),
          lt(reviewFindings.resolutionReplyClaimedAt, leaseExpiredAt),
        ),
      ),
    )
    .returning();
  return finding ?? null;
}

export async function releaseFindingResolutionReply(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  findingId: string,
  resolvedSha: string,
  attemptId: string,
  database: Database = defaultDb,
) {
  const [finding] = await database
    .update(reviewFindings)
    .set({
      resolutionReplyClaimedAt: null,
      resolutionReplyAttemptId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviewFindings.id, findingId),
        eq(reviewFindings.installationId, installationId),
        eq(reviewFindings.repositoryId, repositoryId),
        eq(reviewFindings.prNumber, prNumber),
        eq(reviewFindings.status, "resolved"),
        eq(reviewFindings.resolvedSha, resolvedSha),
        eq(reviewFindings.resolutionReplyAttemptId, attemptId),
        isNull(reviewFindings.resolutionRepliedAt),
        isNotNull(reviewFindings.resolutionReplyClaimedAt),
      ),
    )
    .returning();
  return finding ?? null;
}

/**
 * Mark a finding resolved or dismissed. Terminal statuses cannot silently reopen.
 */
export async function markFindingTerminalStatus(
  installationId: number,
  findingId: string,
  status: Extract<FindingLifecycle, "resolved" | "dismissed">,
  options: { resolvedSha?: string | null } = {},
  database: Database = defaultDb,
) {
  const now = new Date();
  const patch =
    status === "resolved"
      ? {
          status,
          resolvedSha: options.resolvedSha ?? null,
          updatedAt: now,
        }
      : {
          status,
          dismissedAt: now,
          updatedAt: now,
        };

  const [finding] = await database
    .update(reviewFindings)
    .set(patch)
    .where(
      and(
        eq(reviewFindings.id, findingId),
        eq(reviewFindings.installationId, installationId),
        eq(reviewFindings.status, "open"),
      ),
    )
    .returning();

  return finding ?? null;
}

/**
 * Look up a DiffGuard finding by its stored inline GitHub comment id.
 * Always tenant- and PR-scoped so cross-repo/PR parents cannot match.
 */
export async function getFindingByGitHubCommentId(
  installationId: number,
  repositoryId: number,
  prNumber: number,
  githubCommentId: number,
  database: Database = defaultDb,
) {
  const [finding] = await database
    .select()
    .from(reviewFindings)
    .where(
      and(
        eq(reviewFindings.installationId, installationId),
        eq(reviewFindings.repositoryId, repositoryId),
        eq(reviewFindings.prNumber, prNumber),
        eq(reviewFindings.githubCommentId, githubCommentId),
      ),
    )
    .limit(1);

  return finding ?? null;
}

export type FindingFeedbackInput = {
  installationId: number;
  repositoryId: number;
  prNumber: number;
  findingId: string;
  sourceCommentId: number;
  actorLogin: string;
  action: FeedbackAction;
  reason: string | null;
  /** When true, also moves an open finding to dismissed (idempotent). */
  dismissFinding: boolean;
};

/**
 * Record collaborator feedback once per source comment id.
 * Optionally dismisses the open finding in the same batch.
 * Returns whether a new feedback row was inserted.
 */
export async function recordFindingFeedback(
  input: FindingFeedbackInput,
  database: Database = defaultDb,
): Promise<{ recorded: boolean; dismissed: boolean }> {
  const insertFeedback = database
    .insert(findingFeedback)
    .values({
      installationId: input.installationId,
      repositoryId: input.repositoryId,
      prNumber: input.prNumber,
      findingId: input.findingId,
      sourceCommentId: input.sourceCommentId,
      actorLogin: input.actorLogin,
      action: input.action,
      reason: input.reason,
    })
    .onConflictDoNothing({
      target: findingFeedback.sourceCommentId,
    })
    .returning({ id: findingFeedback.id });

  if (!input.dismissFinding) {
    const inserted = await insertFeedback;
    return { recorded: inserted.length > 0, dismissed: false };
  }

  const dismissFinding = database
    .update(reviewFindings)
    .set({
      status: "dismissed",
      dismissedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviewFindings.id, input.findingId),
        eq(reviewFindings.installationId, input.installationId),
        eq(reviewFindings.repositoryId, input.repositoryId),
        eq(reviewFindings.prNumber, input.prNumber),
        eq(reviewFindings.status, "open"),
      ),
    )
    .returning({ id: reviewFindings.id });

  const [insertedRows, dismissedRows] = await database.batch([
    insertFeedback,
    dismissFinding,
  ]);

  return {
    recorded: (insertedRows as { id: string }[]).length > 0,
    dismissed: (dismissedRows as { id: string }[]).length > 0,
  };
}

export type CreateRepositoryLearningInput = {
  installationId: number;
  repositoryId: number;
  guidance: string;
  createdBy: string;
  sourceFindingId?: string | null;
  sourceCommentId?: number | null;
};

export type CreateRepositoryLearningResult =
  | { status: "created"; learning: typeof repositoryLearnings.$inferSelect }
  | { status: "duplicate"; learning: typeof repositoryLearnings.$inferSelect | null }
  | { status: "quota_exceeded" }
  | { status: "invalid_guidance" }
  | { status: "repository_not_found" };

/**
 * Active-quota predicate shared by insert/reactivate race guards.
 * Ranking by (created_at, id) keeps the oldest MAX_ACTIVE_LEARNINGS_PER_REPO.
 */
function learningOverActiveQuotaSql(
  installationId: number,
  repositoryId: number,
) {
  return sql`(
    SELECT COUNT(*)::int
    FROM repository_learnings AS peers
    WHERE peers.installation_id = ${installationId}
      AND peers.repository_id = ${repositoryId}
      AND peers.status = 'active'
      AND (peers.created_at, peers.id) <= (
        ${repositoryLearnings.createdAt},
        ${repositoryLearnings.id}
      )
  ) > ${MAX_ACTIVE_LEARNINGS_PER_REPO}`;
}

/**
 * If a concurrent insert pushed this row past the active quota, delete it.
 * Safe for brand-new rows only (content_hash must not remain occupied).
 */
async function deleteLearningIfOverQuota(
  installationId: number,
  repositoryId: number,
  learningId: string,
  database: Database,
): Promise<boolean> {
  const [deleted] = await database
    .delete(repositoryLearnings)
    .where(
      and(
        eq(repositoryLearnings.id, learningId),
        eq(repositoryLearnings.installationId, installationId),
        eq(repositoryLearnings.repositoryId, repositoryId),
        eq(repositoryLearnings.status, "active"),
        learningOverActiveQuotaSql(installationId, repositoryId),
      ),
    )
    .returning({ id: repositoryLearnings.id });
  return deleted !== undefined;
}

/**
 * If reactivating would exceed the active quota under concurrency, soft-archive
 * the row again so history is preserved.
 */
async function archiveLearningIfOverQuota(
  installationId: number,
  repositoryId: number,
  learningId: string,
  database: Database,
): Promise<boolean> {
  const now = new Date();
  const [archived] = await database
    .update(repositoryLearnings)
    .set({
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(repositoryLearnings.id, learningId),
        eq(repositoryLearnings.installationId, installationId),
        eq(repositoryLearnings.repositoryId, repositoryId),
        eq(repositoryLearnings.status, "active"),
        learningOverActiveQuotaSql(installationId, repositoryId),
      ),
    )
    .returning({ id: repositoryLearnings.id });
  return archived !== undefined;
}

/**
 * Persist an explicit collaborator preference for a repository.
 * Duplicate content hashes and active quotas never create a second active row.
 * Quota is enforced after insert so concurrent remember jobs cannot overshoot.
 */
export async function createRepositoryLearning(
  input: CreateRepositoryLearningInput,
  database: Database = defaultDb,
): Promise<CreateRepositoryLearningResult> {
  const guidance = input.guidance.trim();
  if (!guidance || guidance.length > LEARNING_GUIDANCE_MAX_CHARS) {
    return { status: "invalid_guidance" };
  }

  const [repository] = await database
    .select({ id: repositories.id })
    .from(repositories)
    .where(
      and(
        eq(repositories.id, input.repositoryId),
        eq(repositories.installationId, input.installationId),
      ),
    )
    .limit(1);
  if (!repository) return { status: "repository_not_found" };

  const contentHash = computeLearningContentHash(guidance);

  // Fast path for exact duplicates (any status) before counting/inserting.
  const [existingBefore] = await database
    .select()
    .from(repositoryLearnings)
    .where(
      and(
        eq(repositoryLearnings.installationId, input.installationId),
        eq(repositoryLearnings.repositoryId, input.repositoryId),
        eq(repositoryLearnings.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existingBefore) {
    return { status: "duplicate", learning: existingBefore };
  }

  // Best-effort pre-check to avoid unnecessary inserts under load.
  const activeCountRows = await database
    .select({ id: repositoryLearnings.id })
    .from(repositoryLearnings)
    .where(
      and(
        eq(repositoryLearnings.installationId, input.installationId),
        eq(repositoryLearnings.repositoryId, input.repositoryId),
        eq(repositoryLearnings.status, "active"),
      ),
    );
  if (activeCountRows.length >= MAX_ACTIVE_LEARNINGS_PER_REPO) {
    return { status: "quota_exceeded" };
  }

  const [inserted] = await database
    .insert(repositoryLearnings)
    .values({
      installationId: input.installationId,
      repositoryId: input.repositoryId,
      guidance,
      contentHash,
      status: "active",
      createdBy: input.createdBy,
      sourceFindingId: input.sourceFindingId ?? null,
      sourceCommentId: input.sourceCommentId ?? null,
    })
    .onConflictDoNothing({
      target: [repositoryLearnings.repositoryId, repositoryLearnings.contentHash],
    })
    .returning();

  if (!inserted) {
    const [existing] = await database
      .select()
      .from(repositoryLearnings)
      .where(
        and(
          eq(repositoryLearnings.installationId, input.installationId),
          eq(repositoryLearnings.repositoryId, input.repositoryId),
          eq(repositoryLearnings.contentHash, contentHash),
        ),
      )
      .limit(1);
    return { status: "duplicate", learning: existing ?? null };
  }

  const overQuota = await deleteLearningIfOverQuota(
    input.installationId,
    input.repositoryId,
    inserted.id,
    database,
  );
  if (overQuota) return { status: "quota_exceeded" };

  return { status: "created", learning: inserted };
}

/**
 * Load active learnings for a tenant repository. Revalidates bounds on every load.
 */
export async function listActiveRepositoryLearnings(
  installationId: number,
  repositoryId: number,
  database: Database = defaultDb,
) {
  const rows = await database
    .select({
      id: repositoryLearnings.id,
      guidance: repositoryLearnings.guidance,
      status: repositoryLearnings.status,
    })
    .from(repositoryLearnings)
    .where(
      and(
        eq(repositoryLearnings.installationId, installationId),
        eq(repositoryLearnings.repositoryId, repositoryId),
        eq(repositoryLearnings.status, "active"),
      ),
    )
    .orderBy(asc(repositoryLearnings.createdAt))
    .limit(MAX_ACTIVE_LEARNINGS_PER_REPO);

  return rows.filter(isValidActiveLearning).map((row) => ({
    id: row.id,
    guidance: row.guidance.trim(),
  }));
}

export async function archiveRepositoryLearning(
  installationId: number,
  repositoryId: number,
  learningId: string,
  database: Database = defaultDb,
) {
  const now = new Date();
  const [learning] = await database
    .update(repositoryLearnings)
    .set({
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(repositoryLearnings.id, learningId),
        eq(repositoryLearnings.installationId, installationId),
        eq(repositoryLearnings.repositoryId, repositoryId),
        eq(repositoryLearnings.status, "active"),
      ),
    )
    .returning();
  return learning ?? null;
}

/**
 * Reactivate an archived learning when under the active quota.
 * Post-reactivation eviction closes concurrent overshoot races.
 */
export async function reactivateRepositoryLearning(
  installationId: number,
  repositoryId: number,
  learningId: string,
  database: Database = defaultDb,
): Promise<
  | { status: "reactivated"; learning: typeof repositoryLearnings.$inferSelect }
  | { status: "not_found" }
  | { status: "quota_exceeded" }
> {
  const activeCountRows = await database
    .select({ id: repositoryLearnings.id })
    .from(repositoryLearnings)
    .where(
      and(
        eq(repositoryLearnings.installationId, installationId),
        eq(repositoryLearnings.repositoryId, repositoryId),
        eq(repositoryLearnings.status, "active"),
      ),
    );
  if (activeCountRows.length >= MAX_ACTIVE_LEARNINGS_PER_REPO) {
    return { status: "quota_exceeded" };
  }

  const now = new Date();
  const [learning] = await database
    .update(repositoryLearnings)
    .set({
      status: "active",
      archivedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(repositoryLearnings.id, learningId),
        eq(repositoryLearnings.installationId, installationId),
        eq(repositoryLearnings.repositoryId, repositoryId),
        eq(repositoryLearnings.status, "archived"),
      ),
    )
    .returning();

  if (!learning) return { status: "not_found" };

  const overQuota = await archiveLearningIfOverQuota(
    installationId,
    repositoryId,
    learning.id,
    database,
  );
  if (overQuota) {
    // Row was active only briefly; keep it archived and reject.
    return { status: "quota_exceeded" };
  }

  return { status: "reactivated", learning };
}

/**
 * Aggregate-only usage counters for learnings included in a review prompt.
 * Never logs guidance text.
 */
export async function recordRepositoryLearningUsage(
  installationId: number,
  repositoryId: number,
  learningIds: string[],
  database: Database = defaultDb,
) {
  if (learningIds.length === 0) return 0;

  const uniqueIds = [...new Set(learningIds)];
  const now = new Date();
  const updated = await database
    .update(repositoryLearnings)
    .set({
      usageCount: sql`${repositoryLearnings.usageCount} + 1`,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(repositoryLearnings.installationId, installationId),
        eq(repositoryLearnings.repositoryId, repositoryId),
        eq(repositoryLearnings.status, "active"),
        inArray(repositoryLearnings.id, uniqueIds),
      ),
    )
    .returning({ id: repositoryLearnings.id });

  return updated.length;
}

export async function upsertConfirmedFindings(
  inputs: FindingUpsertInput[],
  database: Database = defaultDb,
) {
  if (inputs.length === 0) return [];

  const repositoriesToValidate = new Map<string, FindingUpsertInput>();
  for (const input of inputs) {
    repositoriesToValidate.set(`${input.installationId}:${input.repositoryId}`, input);
  }
  await Promise.all(
    [...repositoriesToValidate.values()].map((input) =>
      assertFindingRepository(input, database),
    ),
  );

  const queries = inputs.map((input) => buildFindingUpsert(input, database));
  const [firstQuery, ...remainingQueries] = queries;
  if (!firstQuery) return [];

  const results = await database.batch([firstQuery, ...remainingQueries]);
  return results.flat();
}

export type FindingReconciliationInput = {
  installationId: number;
  repositoryId: number;
  prNumber: number;
  headSha: string;
  findingInputs: FindingUpsertInput[];
  resolvedFindingIds: string[];
};

/**
 * Atomically reopen evidence-confirmed findings and resolve only trusted,
 * tenant/PR-scoped open finding ids. Dismissed findings always remain terminal.
 */
export async function reconcileFindings(
  input: FindingReconciliationInput,
  database: Database = defaultDb,
) {
  const sample = input.findingInputs[0];
  if (sample) await assertFindingRepository(sample, database);

  const findingQueries = input.findingInputs.map((finding) =>
    buildFindingUpsert(finding, database, true),
  );
  const resolvedQuery = input.resolvedFindingIds.length > 0
    ? database
      .update(reviewFindings)
      .set({
        status: "resolved",
        resolvedSha: input.headSha,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(reviewFindings.installationId, input.installationId),
          eq(reviewFindings.repositoryId, input.repositoryId),
          eq(reviewFindings.prNumber, input.prNumber),
          eq(reviewFindings.status, "open"),
          inArray(reviewFindings.id, input.resolvedFindingIds),
        ),
      )
      .returning()
    : null;
  const [firstFindingQuery, ...remainingFindingQueries] = findingQueries;
  if (!firstFindingQuery && !resolvedQuery) return { findings: [], resolved: [] };

  if (!resolvedQuery) {
    if (!firstFindingQuery) return { findings: [], resolved: [] };
    const results = await database.batch([
      firstFindingQuery,
      ...remainingFindingQueries,
    ]);
    return { findings: results.flat(), resolved: [] };
  }

  if (!firstFindingQuery) {
    const results = await database.batch([resolvedQuery]);
    return { findings: [], resolved: results[0] ?? [] };
  }

  const results = await database.batch([
    firstFindingQuery,
    ...remainingFindingQueries,
    resolvedQuery,
  ]);
  return {
    findings: results.slice(0, findingQueries.length).flat(),
    resolved: results.at(-1) ?? [],
  };
}
