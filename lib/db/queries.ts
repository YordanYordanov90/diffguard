import { and, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";

import { db as defaultDb } from "./client";
import {
  installations,
  repositories,
  reviews,
  type SkipReason,
} from "./schema";

type Database = typeof defaultDb;

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
  findingsCritical: number;
  findingsHigh: number;
  findingsMedium: number;
  findingsLow: number;
  findingsInfo: number;
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
    .values(input)
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
  database: Database = defaultDb,
) {
  if (installationIds.length === 0 || limit <= 0) return [];

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
    .where(inArray(reviews.installationId, installationIds))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
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
