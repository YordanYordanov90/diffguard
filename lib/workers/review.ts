import { Receiver } from "@upstash/qstash";

import {
  DAILY_REVIEW_CAP,
  FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT,
  FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT,
  REVIEW_PROMPT_TOKEN_BUDGET,
} from "@/lib/config/constants";
import { parseEnv } from "@/lib/config/env";
import type {
  countReviewsToday,
  getInstallationModel,
  getLatestReviewCommentId,
  getReviewBySha,
  markReviewCompleted,
  markReviewFailed,
  markReviewRunning,
  markReviewSkipped,
} from "@/lib/db/queries";
import {
  fetchInstructionsFile,
  fetchPrDiff,
  fetchPrHeadSha,
  fetchRepositoryFile,
  upsertComment,
} from "@/lib/github/client";
import { processDiff } from "@/lib/review/diff";
import { generateReview, ReviewFailedError } from "@/lib/review/generate";
import { reviewJobSchema, type ReviewJob } from "@/lib/review/job";
import {
  buildReviewPrompt,
  estimateReviewPromptTokens,
} from "@/lib/review/prompt";
import { renderReview } from "@/lib/review/render";
import type { ReviewOutput } from "@/lib/review/schema";
import { retrieveFullFileContext } from "./context";

type StoredReview = Awaited<ReturnType<typeof getReviewBySha>>;

type ReviewQueries = {
  getReviewBySha: (...args: Parameters<typeof getReviewBySha>) => Promise<StoredReview>;
  getInstallationModel: (...args: Parameters<typeof getInstallationModel>) => Promise<string | null>;
  getLatestReviewCommentId: (...args: Parameters<typeof getLatestReviewCommentId>) => Promise<number | null>;
  countReviewsToday: (...args: Parameters<typeof countReviewsToday>) => Promise<number>;
  markReviewSkipped: (...args: Parameters<typeof markReviewSkipped>) => Promise<unknown>;
  markReviewRunning: (...args: Parameters<typeof markReviewRunning>) => Promise<StoredReview>;
  markReviewCompleted: (...args: Parameters<typeof markReviewCompleted>) => Promise<StoredReview>;
  markReviewFailed: (...args: Parameters<typeof markReviewFailed>) => Promise<StoredReview>;
};

type GitHubClient = {
  fetchPrHeadSha: typeof fetchPrHeadSha;
  fetchPrDiff: typeof fetchPrDiff;
  fetchInstructionsFile: typeof fetchInstructionsFile;
  fetchRepositoryFile: typeof fetchRepositoryFile;
  upsertComment: typeof upsertComment;
};

type QStashVerifier = {
  verify: (input: { signature: string; body: string; url: string }) => Promise<boolean>;
};

export type ReviewWorkerDependencies = {
  qstash: QStashVerifier;
  queries: ReviewQueries;
  github: GitHubClient;
  generateReview: typeof generateReview;
};

function envelope(success: boolean, data: unknown, error: string | null, status: number) {
  return Response.json({ success, data, error }, { status });
}

function createDefaultDependencies(): ReviewWorkerDependencies {
  const env = parseEnv();
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });

  return {
    qstash: receiver,
    queries: {
      async getReviewBySha(...args) {
        const { getReviewBySha } = await import("@/lib/db/queries");
        return getReviewBySha(...args);
      },
      async getInstallationModel(...args) {
        const { getInstallationModel } = await import("@/lib/db/queries");
        return getInstallationModel(...args);
      },
      async getLatestReviewCommentId(...args) {
        const { getLatestReviewCommentId } = await import("@/lib/db/queries");
        return getLatestReviewCommentId(...args);
      },
      async countReviewsToday(...args) {
        const { countReviewsToday } = await import("@/lib/db/queries");
        return countReviewsToday(...args);
      },
      async markReviewSkipped(...args) {
        const { markReviewSkipped } = await import("@/lib/db/queries");
        return markReviewSkipped(...args);
      },
      async markReviewRunning(...args) {
        const { markReviewRunning } = await import("@/lib/db/queries");
        return markReviewRunning(...args);
      },
      async markReviewCompleted(...args) {
        const { markReviewCompleted } = await import("@/lib/db/queries");
        return markReviewCompleted(...args);
      },
      async markReviewFailed(...args) {
        const { markReviewFailed } = await import("@/lib/db/queries");
        return markReviewFailed(...args);
      },
    },
    github: {
      fetchPrHeadSha,
      fetchPrDiff,
      fetchInstructionsFile,
      fetchRepositoryFile,
      upsertComment,
    },
    generateReview,
  };
}

function safeFailureText(error: unknown): string {
  return error instanceof ReviewFailedError ? error.message : "Review processing failed.";
}

function severityCounts(review: ReviewOutput) {
  return review.findings.reduce(
    (counts, finding) => {
      const key = `findings${finding.severity[0].toUpperCase()}${finding.severity.slice(1)}` as keyof typeof counts;
      counts[key] += 1;
      return counts;
    },
    {
      findingsCritical: 0,
      findingsHigh: 0,
      findingsMedium: 0,
      findingsLow: 0,
      findingsInfo: 0,
    },
  );
}

function isTerminalReview(review: NonNullable<StoredReview>) {
  return review.status === "completed" || review.status === "skipped";
}

function emptyContextBudget(promptTokens: number) {
  const availableTokens = Math.max(0, REVIEW_PROMPT_TOKEN_BUDGET - promptTokens);
  return {
    totalTokenBudget: Math.min(FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT, availableTokens),
    totalByteBudget: Math.min(FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT, availableTokens * 4),
  };
}

async function runReview(job: ReviewJob, dependencies: ReviewWorkerDependencies) {
  const review = await dependencies.queries.getReviewBySha(
    job.installationId,
    job.repositoryId,
    job.prNumber,
    job.headSha,
  );
  if (!review || isTerminalReview(review)) return { status: "already_processed" as const };

  const currentHeadSha = await dependencies.github.fetchPrHeadSha(
    job.installationId,
    job.repoFullName,
    job.prNumber,
  );
  if (currentHeadSha.toLowerCase() !== job.headSha.toLowerCase()) {
    await dependencies.queries.markReviewSkipped(job.installationId, review.id, "stale_sha");
    return { status: "stale_sha" as const };
  }

  const reviewsToday = await dependencies.queries.countReviewsToday(job.installationId);
  if (reviewsToday > DAILY_REVIEW_CAP) {
    await dependencies.queries.markReviewSkipped(job.installationId, review.id, "daily_cap");
    return { status: "daily_cap" as const };
  }

  const runningReview = await dependencies.queries.markReviewRunning(
    job.installationId,
    review.id,
  );
  if (!runningReview) return { status: "already_processing" as const };

  try {
    const [model, rawDiff, instructions] = await Promise.all([
      dependencies.queries.getInstallationModel(job.installationId),
      dependencies.github.fetchPrDiff(job.installationId, job.repoFullName, job.prNumber),
      dependencies.github.fetchInstructionsFile(
        job.installationId,
        job.repoFullName,
        job.headSha,
      ),
    ]);
    if (!model) throw new Error("Installation model configuration is missing.");

    const processedDiff = processDiff(rawDiff);
    const basePrompt = buildReviewPrompt({
      prTitle: job.prTitle,
      prBody: job.prBody,
      fileTree: processedDiff.fileTree,
      diff: processedDiff.diff,
      instructions,
      skippedFiles: processedDiff.skippedFiles,
      changedFileContext: [],
    });
    const contextBudget = emptyContextBudget(estimateReviewPromptTokens(basePrompt));
    const fullFileContext = await retrieveFullFileContext({
      installationId: job.installationId,
      repoFullName: job.repoFullName,
      headSha: job.headSha,
      files: processedDiff.files,
      fetchRepositoryFile: dependencies.github.fetchRepositoryFile,
      ...contextBudget,
    });
    const prompt = buildReviewPrompt({
      prTitle: job.prTitle,
      prBody: job.prBody,
      fileTree: processedDiff.fileTree,
      diff: processedDiff.diff,
      instructions,
      skippedFiles: processedDiff.skippedFiles,
      changedFileContext: fullFileContext.files,
    });
    const generated = await dependencies.generateReview(prompt, { model });
    const markdown = renderReview(generated.output, {
      filesReviewed: processedDiff.files.length,
      skippedFiles: processedDiff.skippedFiles,
      headSha: job.headSha,
    });
    const previousCommentId = review.commentId ?? (await dependencies.queries.getLatestReviewCommentId(
      job.installationId,
      job.repositoryId,
      job.prNumber,
    ));
    const commentId = await dependencies.github.upsertComment(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      previousCommentId,
      markdown,
    );

    await dependencies.queries.markReviewCompleted(job.installationId, review.id, {
      reviewMarkdown: markdown,
      commentId,
      verdict: generated.output.verdict,
      ...severityCounts(generated.output),
      skippedFiles: processedDiff.skippedFiles,
      model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      durationMs: generated.durationMs,
    });
    return { status: "completed" as const, context: fullFileContext.metadata };
  } catch (error) {
    await dependencies.queries.markReviewFailed(
      job.installationId,
      review.id,
      safeFailureText(error),
    );
    throw error;
  }
}

export async function handleReviewWorker(
  request: Request,
  dependencies: ReviewWorkerDependencies,
) {
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");
  if (!signature) return envelope(false, null, "Invalid QStash signature.", 401);

  try {
    const verified = await dependencies.qstash.verify({
      signature,
      body,
      url: request.url,
    });
    if (!verified) return envelope(false, null, "Invalid QStash signature.", 401);
  } catch {
    return envelope(false, null, "Invalid QStash signature.", 401);
  }

  let job: ReviewJob;
  try {
    job = reviewJobSchema.parse(JSON.parse(body));
  } catch {
    return envelope(false, null, "Invalid review job.", 400);
  }

  try {
    const result = await runReview(job, dependencies);
    return envelope(true, result, null, 200);
  } catch (error) {
    if (error instanceof ReviewFailedError && !error.retryable) {
      return envelope(true, { status: "failed" }, null, 200);
    }
    return envelope(false, null, "Review processing failed.", 500);
  }
}

export function createReviewWorkerDependencies() {
  return createDefaultDependencies();
}
