import { Receiver } from "@upstash/qstash";

import {
  DAILY_REVIEW_CAP,
  FULL_FILE_CONTEXT_TIMEOUT_MS,
  FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT,
  FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT,
  LLM_TIMEOUT_MS,
  REVIEW_CONTEXT_MAX_FETCHES,
  REVIEW_PROMPT_TOKEN_BUDGET,
} from "@/lib/config/constants";
import { parseEnv } from "@/lib/config/env";
import type {
  attachFindingGitHubCommentId,
  countReviewsToday,
  FindingUpsertInput,
  getInstallationModel,
  getLatestCompletedReviewForPr,
  getLatestReviewCommentId,
  getReviewBySha,
  markReviewCompleted,
  saveReviewCommentId,
  markReviewFailed,
  markReviewRunning,
  markReviewSkipped,
  listOpenFindingsByPr,
  markFindingResolutionReplied,
  reconcileFindings,
  upsertConfirmedFindings,
} from "@/lib/db/queries";
import {
  fetchCommitComparison,
  fetchCommitRangeDiff,
  createPullRequestReview,
  fetchInstructionsFile,
  fetchPrDiff,
  fetchPrHeadSha,
  fetchRepositoryFile,
  fetchRepositoryTree,
  isCommitOnPullRequest,
  replyToPullRequestReviewComment,
  verifyPullRequestReviewCommentScope,
  upsertComment,
  type CommitComparisonResult,
  listPullRequestReviewComments,
  type CreatedPullRequestReviewComment,
  type CreatePullRequestReviewResult,
  type PullRequestReviewCommentInput,
  type RepositoryTreeResult,
} from "@/lib/github/client";
import {
  planReviewBaseline,
  type BaselinePlan,
  type CommitComparison,
  type ReviewMode,
} from "@/lib/review/baseline";
import { processDiff } from "@/lib/review/diff";
import {
  adjudicateReview,
  generateReview,
  ReviewFailedError,
} from "@/lib/review/generate";
import { reviewJobSchema, type ReviewJob } from "@/lib/review/job";
import { planRelatedCodeContext } from "@/lib/review/related-context";
import {
  buildReviewPrompt,
  buildAdjudicationPrompt,
  estimateReviewPromptTokens,
  fitContextToPromptBudget,
} from "@/lib/review/prompt";
import {
  applyAdjudication,
  emptyGatedReview,
  getRelevantDiffHunks,
  prepareCandidates,
} from "@/lib/review/evidence";
import { toPersistableFindings } from "@/lib/review/fingerprint";
import {
  selectEligibleFindings,
  selectResolvedFindingIds,
  toFinding as toReconciledFinding,
  type OpenFinding,
} from "@/lib/review/reconciliation";
import {
  planInlineComments,
  stripInlineSuggestions,
  type PreparedInlineComment,
} from "@/lib/review/inline";
import { renderReview } from "@/lib/review/render";
import {
  candidateReviewOutputSchema,
  reviewOutputSchema,
  adjudicationOutputSchema,
  type ConfirmedFinding,
  type FindingCandidate,
  type FindingUpdate,
  type ReviewOutput,
} from "@/lib/review/schema";
import { retrieveFullFileContext, retrieveRelatedCodeContext } from "./context";

type StoredReview = Awaited<ReturnType<typeof getReviewBySha>>;
type CompletedBaseline = Awaited<ReturnType<typeof getLatestCompletedReviewForPr>>;
type StoredFinding = Awaited<ReturnType<typeof upsertConfirmedFindings>>[number];
type StoredOpenFinding = Awaited<ReturnType<typeof listOpenFindingsByPr>>[number];
type PublishedInlineReview = CreatePullRequestReviewResult & {
  comments: CreatedPullRequestReviewComment[];
};

type ReviewQueries = {
  getReviewBySha: (...args: Parameters<typeof getReviewBySha>) => Promise<StoredReview>;
  getInstallationModel: (...args: Parameters<typeof getInstallationModel>) => Promise<string | null>;
  getLatestReviewCommentId: (...args: Parameters<typeof getLatestReviewCommentId>) => Promise<number | null>;
  getLatestCompletedReviewForPr: (
    ...args: Parameters<typeof getLatestCompletedReviewForPr>
  ) => Promise<CompletedBaseline>;
  countReviewsToday: (...args: Parameters<typeof countReviewsToday>) => Promise<number>;
  markReviewSkipped: (...args: Parameters<typeof markReviewSkipped>) => Promise<unknown>;
  markReviewRunning: (...args: Parameters<typeof markReviewRunning>) => Promise<StoredReview>;
  markReviewCompleted: (...args: Parameters<typeof markReviewCompleted>) => Promise<StoredReview>;
  saveReviewCommentId: (...args: Parameters<typeof saveReviewCommentId>) => Promise<StoredReview>;
  markReviewFailed: (...args: Parameters<typeof markReviewFailed>) => Promise<StoredReview>;
  upsertConfirmedFindings: (
    ...args: Parameters<typeof upsertConfirmedFindings>
  ) => Promise<StoredFinding[]>;
  attachFindingGitHubCommentId: (
    ...args: Parameters<typeof attachFindingGitHubCommentId>
  ) => Promise<unknown>;
  listOpenFindingsByPr: (
    ...args: Parameters<typeof listOpenFindingsByPr>
  ) => Promise<StoredOpenFinding[]>;
  reconcileFindings: (...args: Parameters<typeof reconcileFindings>) => Promise<{
    findings: StoredFinding[];
    resolved: StoredOpenFinding[];
  }>;
  markFindingResolutionReplied: (
    ...args: Parameters<typeof markFindingResolutionReplied>
  ) => Promise<unknown>;
};

type GitHubClient = {
  fetchPrHeadSha: typeof fetchPrHeadSha;
  fetchPrDiff: typeof fetchPrDiff;
  fetchCommitComparison: typeof fetchCommitComparison;
  fetchCommitRangeDiff: typeof fetchCommitRangeDiff;
  isCommitOnPullRequest: typeof isCommitOnPullRequest;
  fetchInstructionsFile: typeof fetchInstructionsFile;
  fetchRepositoryFile: typeof fetchRepositoryFile;
  fetchRepositoryTree: typeof fetchRepositoryTree;
  upsertComment: typeof upsertComment;
  createPullRequestReview: typeof createPullRequestReview;
  listPullRequestReviewComments: typeof listPullRequestReviewComments;
  replyToPullRequestReviewComment: typeof replyToPullRequestReviewComment;
  verifyPullRequestReviewCommentScope: typeof verifyPullRequestReviewCommentScope;
};

type QStashVerifier = {
  verify: (input: { signature: string; body: string; url: string }) => Promise<boolean>;
};

export type ReviewWorkerDependencies = {
  qstash: QStashVerifier;
  queries: ReviewQueries;
  github: GitHubClient;
  generateReview: typeof generateReview;
  adjudicateReview?: typeof adjudicateReview;
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
      async getLatestCompletedReviewForPr(...args) {
        const { getLatestCompletedReviewForPr } = await import("@/lib/db/queries");
        return getLatestCompletedReviewForPr(...args);
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
      async saveReviewCommentId(...args) {
        const { saveReviewCommentId } = await import("@/lib/db/queries");
        return saveReviewCommentId(...args);
      },
      async markReviewFailed(...args) {
        const { markReviewFailed } = await import("@/lib/db/queries");
        return markReviewFailed(...args);
      },
      async upsertConfirmedFindings(...args) {
        const { upsertConfirmedFindings } = await import("@/lib/db/queries");
        return upsertConfirmedFindings(...args);
      },
      async attachFindingGitHubCommentId(...args) {
        const { attachFindingGitHubCommentId } = await import("@/lib/db/queries");
        return attachFindingGitHubCommentId(...args);
      },
      async listOpenFindingsByPr(...args) {
        const { listOpenFindingsByPr } = await import("@/lib/db/queries");
        return listOpenFindingsByPr(...args);
      },
      async reconcileFindings(...args) {
        const { reconcileFindings } = await import("@/lib/db/queries");
        return reconcileFindings(...args);
      },
      async markFindingResolutionReplied(...args) {
        const { markFindingResolutionReplied } = await import("@/lib/db/queries");
        return markFindingResolutionReplied(...args);
      },
    },
    github: {
      fetchPrHeadSha,
      fetchPrDiff,
      fetchCommitComparison,
      fetchCommitRangeDiff,
      isCommitOnPullRequest,
      fetchInstructionsFile,
      fetchRepositoryFile,
      fetchRepositoryTree,
      upsertComment,
      createPullRequestReview,
      listPullRequestReviewComments,
      replyToPullRequestReviewComment,
      verifyPullRequestReviewCommentScope,
    },
    generateReview,
    adjudicateReview,
  };
}

function toReviewCommentInput(
  comment: PreparedInlineComment,
): PullRequestReviewCommentInput {
  return {
    path: comment.path,
    body: comment.body,
    line: comment.line,
    side: comment.side,
    ...(comment.startLine !== undefined
      ? { startLine: comment.startLine, startSide: comment.startSide }
      : {}),
  };
}

async function listPublishedInlineReviewComments(
  dependencies: ReviewWorkerDependencies,
  job: ReviewJob,
  reviewId: number,
): Promise<CreatedPullRequestReviewComment[] | null> {
  try {
    return await dependencies.github.listPullRequestReviewComments(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      reviewId,
    );
  } catch {
    try {
      return await dependencies.github.listPullRequestReviewComments(
        job.installationId,
        job.repoFullName,
        job.prNumber,
        reviewId,
      );
    } catch {
      return null;
    }
  }
}

async function publishInlineReview(
  dependencies: ReviewWorkerDependencies,
  job: ReviewJob,
  comments: PreparedInlineComment[],
): Promise<PublishedInlineReview | null> {
  if (comments.length === 0) return null;

  let review: CreatePullRequestReviewResult;
  try {
    review = await dependencies.github.createPullRequestReview(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      job.headSha,
      comments.map(toReviewCommentInput),
    );
  } catch {
    // Retry once without suggestion blocks / multi-line anchors.
    try {
      review = await dependencies.github.createPullRequestReview(
        job.installationId,
        job.repoFullName,
        job.prNumber,
        job.headSha,
        stripInlineSuggestions(comments).map(toReviewCommentInput),
      );
    } catch {
      // Inline is secondary: summary review must still complete.
      return null;
    }
  }

  const published = await listPublishedInlineReviewComments(
    dependencies,
    job,
    review.reviewId,
  );
  return published ? { reviewId: review.reviewId, comments: published } : null;
}

function matchPublishedCommentIds(
  prepared: PreparedInlineComment[],
  published: PublishedInlineReview,
): Array<{ findingId: string; commentId: number }> {
  const remaining = [...published.comments];
  const matches: Array<{ findingId: string; commentId: number }> = [];

  for (const comment of prepared) {
    const index = remaining.findIndex(
      (candidate) =>
        candidate.path === comment.path &&
        candidate.line === comment.line &&
        candidate.body === comment.body &&
        (comment.startLine === undefined ||
          candidate.startLine === comment.startLine ||
          candidate.startLine === null),
    );
    if (index < 0) continue;
    matches.push({ findingId: comment.findingId, commentId: remaining[index].id });
    remaining.splice(index, 1);
  }

  return matches;
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

function parseCandidateOutput(output: unknown): {
  candidates: FindingCandidate[];
  findingUpdates: FindingUpdate[];
} {
  const candidateOutput = candidateReviewOutputSchema.safeParse(output);
  if (candidateOutput.success) return candidateOutput.data;
  const legacyOutput = reviewOutputSchema.safeParse(output);
  if (!legacyOutput.success) return { candidates: [], findingUpdates: [] };
  return {
    candidates: legacyOutput.data.findings.map((finding) => ({
      ...finding,
      confidence: "high" as const,
      observedBehavior: "",
      causalPath: "",
      violatedInvariant: "",
      requiresRuntimeVerification: false,
      suggestedChange: null,
    })),
    findingUpdates: [],
  };
}

function toOpenFinding(finding: StoredOpenFinding): OpenFinding {
  return {
    id: finding.id,
    file: finding.file,
    line: finding.line,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    category: finding.category,
    suggestion: finding.suggestion,
  };
}

function resolutionReplyBody(headSha: string): string {
  return `✅ DiffGuard marked this finding resolved in \`${headSha.slice(0, 7)}\`.`;
}

function addUsage(
  left: { inputTokens: number | null; outputTokens: number | null },
  right: { inputTokens: number | null; outputTokens: number | null },
) {
  return {
    inputTokens: (left.inputTokens ?? 0) + (right.inputTokens ?? 0),
    outputTokens: (left.outputTokens ?? 0) + (right.outputTokens ?? 0),
  };
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

function fetchRepositoryTreeWithinDeadline(
  dependencies: ReviewWorkerDependencies,
  job: ReviewJob,
  deadline: number,
): Promise<RepositoryTreeResult> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.resolve({ status: "unavailable" });
  const controller = new AbortController();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      controller.abort();
      resolve({ status: "unavailable" });
    }, remainingMs);
    dependencies.github
      .fetchRepositoryTree(job.installationId, job.repoFullName, job.headSha, controller.signal)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve({ status: "unavailable" });
      });
  });
}

function toCommitComparison(
  result: CommitComparisonResult,
  commitInPullRequest: boolean,
): CommitComparison {
  if (result.status === "unavailable") {
    return {
      status: "diverged",
      aheadBy: 0,
      behindBy: 0,
      truncated: false,
      baseUnavailable: true,
      commitInPullRequest: false,
    };
  }
  return {
    status: result.comparisonStatus,
    aheadBy: result.aheadBy,
    behindBy: result.behindBy,
    truncated: result.truncated,
    baseUnavailable: false,
    commitInPullRequest,
  };
}

type DiffSelection = {
  plan: BaselinePlan;
  rawDiff: string;
};

/**
 * Resolve which diff to review. Previous SHAs come only from completed
 * review rows; comparison uses server-validated SHAs inside the authorized repo.
 */
async function selectReviewDiff(
  job: ReviewJob,
  dependencies: ReviewWorkerDependencies,
): Promise<DiffSelection> {
  const forceFullReview = job.forceFullReview === true;

  if (forceFullReview) {
    const plan = planReviewBaseline({
      forceFullReview: true,
      previousHeadSha: null,
      currentHeadSha: job.headSha,
      comparison: null,
    });
    const rawDiff = await dependencies.github.fetchPrDiff(
      job.installationId,
      job.repoFullName,
      job.prNumber,
    );
    return { plan, rawDiff };
  }

  const previous = await dependencies.queries.getLatestCompletedReviewForPr(
    job.installationId,
    job.repositoryId,
    job.prNumber,
  );

  if (!previous) {
    const plan = planReviewBaseline({
      forceFullReview: false,
      previousHeadSha: null,
      currentHeadSha: job.headSha,
      comparison: null,
    });
    const rawDiff = await dependencies.github.fetchPrDiff(
      job.installationId,
      job.repoFullName,
      job.prNumber,
    );
    return { plan, rawDiff };
  }

  const [comparisonResult, commitInPullRequest] = await Promise.all([
    dependencies.github.fetchCommitComparison(
      job.installationId,
      job.repoFullName,
      previous.headSha,
      job.headSha,
    ),
    dependencies.github.isCommitOnPullRequest(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      previous.headSha,
    ),
  ]);

  const plan = planReviewBaseline({
    forceFullReview: false,
    previousHeadSha: previous.headSha,
    currentHeadSha: job.headSha,
    comparison: toCommitComparison(comparisonResult, commitInPullRequest),
  });

  if (plan.useIncrementalDiff && plan.comparedFromSha) {
    const rangeDiff = await dependencies.github.fetchCommitRangeDiff(
      job.installationId,
      job.repoFullName,
      plan.comparedFromSha,
      job.headSha,
    );
    if (rangeDiff !== null) {
      return { plan, rawDiff: rangeDiff };
    }
    // Range fetch failed after a trusted plan — broaden to full PR diff.
    const fallbackPlan: BaselinePlan = {
      mode: "fallback_full",
      comparedFromSha: previous.headSha,
      useIncrementalDiff: false,
    };
    const rawDiff = await dependencies.github.fetchPrDiff(
      job.installationId,
      job.repoFullName,
      job.prNumber,
    );
    return { plan: fallbackPlan, rawDiff };
  }

  const rawDiff = await dependencies.github.fetchPrDiff(
    job.installationId,
    job.repoFullName,
    job.prNumber,
  );
  return { plan, rawDiff };
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

  const reviewStartedAt = Date.now();
  const llmDeadline = reviewStartedAt + LLM_TIMEOUT_MS;
  try {
    const [{ plan, rawDiff }, model, instructions] = await Promise.all([
      selectReviewDiff(job, dependencies),
      dependencies.queries.getInstallationModel(job.installationId),
      dependencies.github.fetchInstructionsFile(
        job.installationId,
        job.repoFullName,
        job.headSha,
      ),
    ]);
    if (!model) throw new Error("Installation model configuration is missing.");

    const reviewMode: ReviewMode = plan.mode;
    const processedDiff = processDiff(rawDiff);
    const openFindings = reviewMode === "incremental"
      ? await dependencies.queries.listOpenFindingsByPr(
        job.installationId,
        job.repositoryId,
        job.prNumber,
      )
      : [];
    const eligibleOpenFindings = selectEligibleFindings(
      openFindings.map(toOpenFinding),
      processedDiff.files,
    );
    const promptContext = {
      prTitle: job.prTitle,
      prBody: job.prBody,
      fileTree: processedDiff.fileTree,
      diff: processedDiff.diff,
      instructions,
      skippedFiles: processedDiff.skippedFiles,
      reconciliationFindings: eligibleOpenFindings.map((finding) => ({
        id: finding.id,
        file: finding.file,
        line: finding.line,
        title: finding.title,
        detail: finding.detail.slice(0, 1_000),
      })),
    };
    const basePrompt = buildReviewPrompt({
      ...promptContext,
      changedFileContext: [],
      relatedCodeContext: [],
    });
    const contextBudget = emptyContextBudget(estimateReviewPromptTokens(basePrompt));
    const contextDeadline = Date.now() + FULL_FILE_CONTEXT_TIMEOUT_MS;
    const [fullFileContext, repositoryTree] = await Promise.all([
      retrieveFullFileContext({
        installationId: job.installationId,
        repoFullName: job.repoFullName,
        headSha: job.headSha,
        files: processedDiff.files,
        fetchRepositoryFile: dependencies.github.fetchRepositoryFile,
        ...contextBudget,
        deadline: contextDeadline,
      }),
      contextBudget.totalByteBudget > 0 && contextBudget.totalTokenBudget > 0
        ? fetchRepositoryTreeWithinDeadline(dependencies, job, contextDeadline)
        : Promise.resolve({ status: "unavailable" as const }),
    ]);
    const relatedPlan = planRelatedCodeContext({
      changedFiles: processedDiff.files,
      fullFileContext: fullFileContext.files,
      repositoryPaths: repositoryTree.status === "fetched" ? repositoryTree.paths : [],
      requestBudget: Math.max(0, REVIEW_CONTEXT_MAX_FETCHES - fullFileContext.requestCount),
    });
    const relatedCodeContext = await retrieveRelatedCodeContext({
      installationId: job.installationId,
      repoFullName: job.repoFullName,
      headSha: job.headSha,
      candidates: relatedPlan.candidates,
      fetchRepositoryFile: dependencies.github.fetchRepositoryFile,
      totalByteBudget: Math.max(
        0,
        contextBudget.totalByteBudget - fullFileContext.metadata.suppliedBytes,
      ),
      totalTokenBudget: Math.max(
        0,
        contextBudget.totalTokenBudget - fullFileContext.metadata.suppliedTokens,
      ),
      deadline: contextDeadline,
    });
    const fittedContext = fitContextToPromptBudget(
      {
        ...promptContext,
        changedFileContext: fullFileContext.files,
        relatedCodeContext: relatedCodeContext.files,
      },
      REVIEW_PROMPT_TOKEN_BUDGET,
    );
    const prompt = buildReviewPrompt({ ...promptContext, ...fittedContext });
    const generated = await dependencies.generateReview(prompt, { model }, { deadline: llmDeadline });
    const generatedOutput = parseCandidateOutput(generated.output);
    const generatedCandidates = generatedOutput.candidates;
    const prepared = prepareCandidates(generatedCandidates, processedDiff.files);
    let gatedReview = emptyGatedReview();
    let confirmedFindings: ConfirmedFinding[] = [];
    let rejectedFindings = prepared.rejectedCount;
    let manualCheckCandidates = 0;
    let adjudicationModel: string | null = null;
    let adjudicationDurationMs: number | null = null;
    let totalUsage = generated.usage;

    if (prepared.candidates.length > 0) {
      if (!dependencies.adjudicateReview) {
        throw new Error("Finding adjudication is not configured.");
      }
      adjudicationModel = model;
      const adjudicationStartedAt = Date.now();
      try {
        const adjudicated = await dependencies.adjudicateReview(
          buildAdjudicationPrompt({
            candidates: prepared.candidates,
            diffHunks: getRelevantDiffHunks(prepared.candidates, processedDiff.files),
            changedFileContext: fullFileContext.files,
            relatedCodeContext: relatedCodeContext.files,
          }),
          { model },
          { deadline: llmDeadline },
        );
        const parsedAdjudication = adjudicationOutputSchema.safeParse(adjudicated.output);
        if (parsedAdjudication.success) {
          const decision = applyAdjudication(
            prepared.candidates,
            parsedAdjudication.data,
            prepared.rejectedCount,
          );
          gatedReview = decision.review;
          confirmedFindings = decision.confirmedFindings;
          rejectedFindings = decision.rejectedCount;
          manualCheckCandidates = decision.manualCount;
        } else {
          rejectedFindings += prepared.candidates.length;
        }
        totalUsage = addUsage(totalUsage, adjudicated.usage);
      } catch (error) {
        if (!(error instanceof ReviewFailedError) || (!error.timedOut && error.retryable)) {
          throw error;
        }
        rejectedFindings += prepared.candidates.length;
      } finally {
        adjudicationDurationMs = Date.now() - adjudicationStartedAt;
      }
    }

    const persistableFindings = toPersistableFindings(
      confirmedFindings,
      processedDiff.files,
    );
    const reconfirmedFingerprints = new Set(
      persistableFindings.map((finding) => finding.fingerprint),
    );
    const reconfirmedFindingIds = new Set(
      openFindings
        .filter((finding) => reconfirmedFingerprints.has(finding.fingerprint))
        .map((finding) => finding.id),
    );
    const resolvedFindingIds = selectResolvedFindingIds(
      generatedOutput.findingUpdates,
      eligibleOpenFindings,
    ).filter((id) => !reconfirmedFindingIds.has(id));
    const persistenceHeadSha = await dependencies.github.fetchPrHeadSha(
      job.installationId,
      job.repoFullName,
      job.prNumber,
    );
    if (persistenceHeadSha.toLowerCase() !== job.headSha.toLowerCase()) {
      await dependencies.queries.markReviewSkipped(job.installationId, review.id, "stale_sha");
      return { status: "stale_sha" as const };
    }
    const findingInputs: FindingUpsertInput[] = persistableFindings.map((finding) => ({
        installationId: job.installationId,
        repositoryId: job.repositoryId,
        prNumber: job.prNumber,
        fingerprint: finding.fingerprint,
        confidence: finding.confidence,
        severity: finding.severity,
        category: finding.category,
        file: finding.file,
        line: finding.line,
        title: finding.title,
        detail: finding.detail,
        observedBehavior: finding.observedBehavior,
        causalPath: finding.causalPath,
        violatedInvariant: finding.violatedInvariant,
        suggestion: finding.suggestion,
        suggestedChange: finding.suggestedChange,
        reviewId: review.id,
        headSha: job.headSha,
      }));
    const reconciliation = findingInputs.length > 0 || resolvedFindingIds.length > 0
      ? await dependencies.queries.reconcileFindings({
        installationId: job.installationId,
        repositoryId: job.repositoryId,
        prNumber: job.prNumber,
        headSha: job.headSha,
        findingInputs,
        resolvedFindingIds,
      })
      : { findings: [], resolved: [] };
    const storedFindings = reconciliation.findings;

    const inlinePlan = planInlineComments(
      storedFindings.map((finding) => ({
        id: finding.id,
        fingerprint: finding.fingerprint,
        githubCommentId: finding.githubCommentId,
        confidence: finding.confidence,
        severity: finding.severity,
        category: finding.category,
        file: finding.file,
        line: finding.line,
        title: finding.title,
        detail: finding.detail,
        suggestion: finding.suggestion,
        suggestedChange: finding.suggestedChange,
      })),
      processedDiff.files,
    );

    let publishedInline: PublishedInlineReview | null = null;
    if (inlinePlan.comments.length > 0) {
      const latestHeadSha = await dependencies.github.fetchPrHeadSha(
        job.installationId,
        job.repoFullName,
        job.prNumber,
      );
      if (latestHeadSha.toLowerCase() !== job.headSha.toLowerCase()) {
        await dependencies.queries.markReviewSkipped(job.installationId, review.id, "stale_sha");
        return { status: "stale_sha" as const };
      }
      publishedInline = await publishInlineReview(dependencies, job, inlinePlan.comments);
    }
    const attachedFindingIds = new Set<string>();
    if (publishedInline) {
      const matches = matchPublishedCommentIds(inlinePlan.comments, publishedInline);
      for (const match of matches) {
        try {
          await dependencies.queries.attachFindingGitHubCommentId(
            job.installationId,
            match.findingId,
            match.commentId,
          );
          attachedFindingIds.add(match.findingId);
        } catch {
          // Secondary persistence failure must not block the summary comment.
        }
      }
    }

    const findingsWithInline = new Set(
      storedFindings
        .filter((finding) => finding.githubCommentId !== null)
        .map((finding) => finding.id),
    );
    for (const id of attachedFindingIds) findingsWithInline.add(id);
    const summaryOnlyFindingCount = storedFindings.filter(
      (finding) => !findingsWithInline.has(finding.id),
    ).length;
    const attachedInlineCount = attachedFindingIds.size;
    const resolvedFindingIdSet = new Set(reconciliation.resolved.map((finding) => finding.id));
    const openFindingIds = new Set(openFindings.map((finding) => finding.id));
    const reconciliationMetadata = reviewMode === "incremental"
      ? {
        newFindings: storedFindings
          .filter((finding) => finding.introducedReviewId === review.id)
          .map(toReconciledFinding),
        recurringFindings: storedFindings
          .filter(
            (finding) =>
              finding.introducedReviewId !== review.id && !openFindingIds.has(finding.id),
          )
          .map(toReconciledFinding),
        stillOpenFindings: openFindings
          .filter((finding) => !resolvedFindingIdSet.has(finding.id))
          .map(toReconciledFinding),
        resolvedFindings: reconciliation.resolved.map(toReconciledFinding),
      }
      : undefined;

    const markdown = renderReview(gatedReview, {
      filesReviewed: processedDiff.files.length,
      skippedFiles: processedDiff.skippedFiles,
      headSha: job.headSha,
      reviewMode,
      comparedFromSha: plan.comparedFromSha,
      summaryOnlyFindingCount,
      inlineCommentCount: attachedInlineCount,
      reconciliation: reconciliationMetadata,
    });

    // Re-check head immediately before publication (debounce resolution).
    const publishHeadSha = await dependencies.github.fetchPrHeadSha(
      job.installationId,
      job.repoFullName,
      job.prNumber,
    );
    if (publishHeadSha.toLowerCase() !== job.headSha.toLowerCase()) {
      await dependencies.queries.markReviewSkipped(job.installationId, review.id, "stale_sha");
      return { status: "stale_sha" as const };
    }

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
    await dependencies.queries.saveReviewCommentId(
      job.installationId,
      review.id,
      commentId,
    );

    await dependencies.queries.markReviewCompleted(job.installationId, review.id, {
      reviewMarkdown: markdown,
      commentId,
      verdict: gatedReview.verdict,
      reviewMode,
      comparedFromSha: plan.comparedFromSha,
      ...severityCounts(gatedReview),
      candidateFindings: generatedCandidates.length,
      rejectedFindings,
      manualCheckCandidates,
      adjudicationModel,
      adjudicationDurationMs,
      skippedFiles: processedDiff.skippedFiles,
      model,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      durationMs: Date.now() - reviewStartedAt,
    });
    for (const finding of reconciliation.resolved) {
      if (finding.githubCommentId === null || finding.resolutionRepliedAt !== null) continue;
      const commentIsInScope = await dependencies.github.verifyPullRequestReviewCommentScope(
        job.installationId,
        job.repoFullName,
        job.prNumber,
        finding.githubCommentId,
      );
      if (!commentIsInScope) continue;
      try {
        await dependencies.github.replyToPullRequestReviewComment(
          job.installationId,
          job.repoFullName,
          job.prNumber,
          finding.githubCommentId,
          resolutionReplyBody(job.headSha),
        );
        await dependencies.queries.markFindingResolutionReplied(
          job.installationId,
          job.repositoryId,
          job.prNumber,
          finding.id,
        );
      } catch {
        // The summary is canonical; a later retry can safely attempt the reply.
      }
    }
    return {
      status: "completed" as const,
      reviewMode,
      comparedFromSha: plan.comparedFromSha,
      context: {
        fullFile: fullFileContext.metadata,
        relatedCode: relatedCodeContext.metadata,
        requestCount: fullFileContext.requestCount + relatedCodeContext.requestCount,
        repositoryTree: repositoryTree.status,
        inlineComments: attachedInlineCount,
      },
    };
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
