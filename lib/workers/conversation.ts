import { createHash } from "node:crypto";

import { Client } from "@upstash/qstash";
import { Receiver } from "@upstash/qstash";

import {
  CHAT_DIFF_CHAR_LIMIT,
  DEBOUNCE_SECONDS,
  LLM_TIMEOUT_MS,
} from "@/lib/config/constants";
import { parseEnv } from "@/lib/config/env";
import {
  claimInteractionRunning,
  createQueuedReview,
  getInstallationModel,
  getInteractionById,
  getLatestCompletedReviewForPr,
  isPrReviewPaused,
  listOpenFindingsByPr,
  markInteractionCompleted,
  markInteractionFailed,
  markInteractionSkipped,
  setPrReviewPaused,
} from "@/lib/db/queries";
import {
  createIssueComment,
  fetchIssueComment,
  fetchPrDiff,
  fetchPullRequestAccessibility,
  getCollaboratorPermission,
  isNonRetryableIssueCommentError,
  listIssueComments,
  type RepositoryPermission,
} from "@/lib/github/client";
import { getReviewWorkerUrl } from "@/lib/github/review-trigger";
import {
  buildChatPrompt,
  buildChatReferenceAllowlist,
  boundChatFindings,
  filterChatReferences,
  formatChatReply,
} from "@/lib/review/chat";
import {
  controlAcknowledgement,
  controlRequiresWriteAccess,
  feedbackRedirectAcknowledgement,
  parseConversationCommand,
  type ReviewControlAction,
} from "@/lib/review/conversation-command";
import {
  conversationJobSchema,
  type ConversationJob,
} from "@/lib/review/conversation-job";
import {
  boundThreadComments,
} from "@/lib/review/conversation-mention";
import { processDiff } from "@/lib/review/diff";
import {
  generateChat,
  ReviewFailedError,
} from "@/lib/review/generate";
import type { ReviewJob } from "@/lib/review/job";

type QStashVerifier = {
  verify: (request: {
    signature: string;
    body: string;
    url: string;
  }) => Promise<boolean>;
};

type ConversationQueries = {
  getInteractionById: typeof getInteractionById;
  claimInteractionRunning: typeof claimInteractionRunning;
  markInteractionCompleted: typeof markInteractionCompleted;
  markInteractionFailed: typeof markInteractionFailed;
  markInteractionSkipped: typeof markInteractionSkipped;
  setPrReviewPaused: typeof setPrReviewPaused;
  isPrReviewPaused: typeof isPrReviewPaused;
  createQueuedReview: typeof createQueuedReview;
  getInstallationModel: typeof getInstallationModel;
  listOpenFindingsByPr: typeof listOpenFindingsByPr;
  getLatestCompletedReviewForPr: typeof getLatestCompletedReviewForPr;
};

type ConversationGitHub = {
  getCollaboratorPermission: typeof getCollaboratorPermission;
  fetchIssueComment: typeof fetchIssueComment;
  fetchPullRequestAccessibility: typeof fetchPullRequestAccessibility;
  listIssueComments: typeof listIssueComments;
  createIssueComment: typeof createIssueComment;
  fetchPrDiff: typeof fetchPrDiff;
};

type ReviewPublisher = {
  publishJSON: (request: {
    url: string;
    body: ReviewJob;
    delay: number;
  }) => Promise<unknown>;
};

export type ConversationWorkerDependencies = {
  qstash: QStashVerifier;
  queries: ConversationQueries;
  github: ConversationGitHub;
  generateChat: typeof generateChat;
  reviewPublisher: ReviewPublisher;
  reviewWorkerUrl: string;
};

function envelope(
  success: boolean,
  data: unknown,
  error: string | null,
  status: number,
) {
  return Response.json({ success, data, error }, { status });
}

function createDefaultDependencies(): ConversationWorkerDependencies {
  const env = parseEnv();
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });
  const qstashClient = new Client({ token: env.QSTASH_TOKEN });

  return {
    qstash: receiver,
    queries: {
      getInteractionById,
      claimInteractionRunning,
      markInteractionCompleted,
      markInteractionFailed,
      markInteractionSkipped,
      setPrReviewPaused,
      isPrReviewPaused,
      createQueuedReview,
      getInstallationModel,
      listOpenFindingsByPr,
      getLatestCompletedReviewForPr,
    },
    github: {
      getCollaboratorPermission,
      fetchIssueComment,
      fetchPullRequestAccessibility,
      listIssueComments,
      createIssueComment,
      fetchPrDiff,
    },
    generateChat,
    reviewPublisher: {
      publishJSON: (request) => qstashClient.publishJSON(request),
    },
    reviewWorkerUrl: getReviewWorkerUrl(),
  };
}

const COLLABORATOR_PERMISSIONS = new Set<RepositoryPermission>([
  "admin",
  "maintain",
  "write",
  "triage",
  "read",
]);

const WRITE_PERMISSIONS = new Set<RepositoryPermission>([
  "admin",
  "maintain",
  "write",
]);

export function actorMayStartConversation(
  permission: RepositoryPermission,
  actorLogin: string,
  prAuthorLogin: string,
): boolean {
  const isPrAuthor =
    actorLogin.localeCompare(prAuthorLogin, undefined, {
      sensitivity: "accent",
    }) === 0;
  return isPrAuthor || COLLABORATOR_PERMISSIONS.has(permission);
}

export function actorMayRunControl(
  action: ReviewControlAction,
  permission: RepositoryPermission,
): boolean {
  if (controlRequiresWriteAccess(action)) {
    return WRITE_PERMISSIONS.has(permission);
  }
  // Manual reviews consume the installation's review budget.
  return WRITE_PERMISSIONS.has(permission);
}

export function getConversationReplyMarker(job: ConversationJob) {
  const receipt = createHash("sha256")
    .update(
      `${job.installationId}:${job.repositoryId}:${job.prNumber}:${job.sourceCommentId}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `<!-- diffguard-reply:${receipt} -->`;
}

/** @deprecated use getConversationReplyMarker */
export function getConversationAcknowledgementMarker(job: ConversationJob) {
  return getConversationReplyMarker(job);
}

function withReplyMarker(job: ConversationJob, body: string) {
  return `${getConversationReplyMarker(job)}\n${body}`;
}

async function postReplyOnce(
  job: ConversationJob,
  body: string,
  dependencies: ConversationWorkerDependencies,
  threadComments: { body: string }[],
) {
  const marker = getConversationReplyMarker(job);
  if (threadComments.some((comment) => comment.body.includes(marker))) {
    return;
  }
  try {
    await dependencies.github.createIssueComment(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      withReplyMarker(job, body),
    );
  } catch (error) {
    if (isNonRetryableIssueCommentError(error)) return;
    throw error;
  }
}

async function enqueueManualReview(
  job: ConversationJob,
  pr: {
    title: string;
    body: string | null;
    headSha: string;
  },
  forceFullReview: boolean,
  dependencies: ConversationWorkerDependencies,
): Promise<{ status: "queued" | "duplicate" | "daily_cap" | "failed" }> {
  const queued = await dependencies.queries.createQueuedReview({
    installationId: job.installationId,
    repositoryId: job.repositoryId,
    prNumber: job.prNumber,
    headSha: pr.headSha,
    enforceDailyCap: true,
  });
  if (queued.reason === "daily_cap") return { status: "daily_cap" };
  if (!queued.review) return { status: "failed" };

  if (!queued.created && queued.review.status !== "queued") {
    return { status: "duplicate" };
  }

  const reviewJob: ReviewJob = {
    installationId: job.installationId,
    repositoryId: job.repositoryId,
    repoFullName: job.repoFullName,
    prNumber: job.prNumber,
    prTitle: pr.title,
    prBody: pr.body,
    headSha: pr.headSha,
    deliveryId: job.deliveryId,
    forceFullReview,
  };

  try {
    await dependencies.reviewPublisher.publishJSON({
      url: dependencies.reviewWorkerUrl,
      body: reviewJob,
      // Manual commands should start promptly; still use a short debounce.
      delay: Math.min(DEBOUNCE_SECONDS, 15),
    });
  } catch {
    return { status: "failed" };
  }

  return { status: "queued" };
}

async function handleControlCommand(
  job: ConversationJob,
  action: ReviewControlAction,
  actorLogin: string,
  pr: { title: string; body: string | null; headSha: string },
  threadComments: { body: string }[],
  dependencies: ConversationWorkerDependencies,
) {
  if (action === "pause" || action === "resume") {
    await dependencies.queries.setPrReviewPaused(
      job.installationId,
      job.repositoryId,
      job.prNumber,
      action === "pause",
      actorLogin,
    );
    await postReplyOnce(
      job,
      controlAcknowledgement(action),
      dependencies,
      threadComments,
    );
    return { kind: "control" as const, action };
  }

  const enqueue = await enqueueManualReview(
    job,
    pr,
    action === "full_review",
    dependencies,
  );

  if (enqueue.status === "daily_cap") {
    await postReplyOnce(
      job,
      "Could not queue a review: the daily review cap for this installation has been reached.",
      dependencies,
      threadComments,
    );
    return { kind: "control" as const, action, enqueue: enqueue.status };
  }
  if (enqueue.status === "duplicate") {
    await postReplyOnce(
      job,
      "A review for this head is already in progress or completed.",
      dependencies,
      threadComments,
    );
    return { kind: "control" as const, action, enqueue: enqueue.status };
  }
  if (enqueue.status === "failed") {
    await postReplyOnce(
      job,
      "Could not queue a review right now. Automatic reviews are unchanged.",
      dependencies,
      threadComments,
    );
    return { kind: "control" as const, action, enqueue: enqueue.status };
  }

  await postReplyOnce(
    job,
    controlAcknowledgement(action),
    dependencies,
    threadComments,
  );
  return { kind: "control" as const, action, enqueue: "queued" as const };
}

async function handleChatQuestion(
  job: ConversationJob,
  question: string,
  pr: {
    title: string;
    body: string | null;
    headSha: string;
    authorLogin: string;
  },
  threadComments: { userLogin: string; body: string }[],
  dependencies: ConversationWorkerDependencies,
  startedAt: number,
) {
  const model = await dependencies.queries.getInstallationModel(
    job.installationId,
  );
  if (!model) {
    await postReplyOnce(
      job,
      "Chat is unavailable: installation model is not configured.",
      dependencies,
      threadComments,
    );
    return {
      kind: "question" as const,
      answered: false,
      reason: "model_missing" as const,
    };
  }

  const [rawDiff, openFindings, latestReview] = await Promise.all([
    dependencies.github.fetchPrDiff(
      job.installationId,
      job.repoFullName,
      job.prNumber,
    ),
    dependencies.queries.listOpenFindingsByPr(
      job.installationId,
      job.repositoryId,
      job.prNumber,
    ),
    dependencies.queries.getLatestCompletedReviewForPr(
      job.installationId,
      job.repositoryId,
      job.prNumber,
    ),
  ]);

  const processed = processDiff(rawDiff);
  const diffForPrompt =
    processed.diff.length > CHAT_DIFF_CHAR_LIMIT
      ? `${processed.diff.slice(0, CHAT_DIFF_CHAR_LIMIT)}\n…[truncated for chat budget]`
      : processed.diff;

  const allowedFiles = processed.fileTree;
  const allowedLines = buildChatReferenceAllowlist(
    diffForPrompt,
    openFindings.map((finding) => ({ file: finding.file, line: finding.line })),
  );
  const linkedIssues = (latestReview?.linkedIssueAssessments ?? []).map(
    (assessment) => ({
      issueNumber: assessment.issueNumber,
      title: assessment.title,
      status: assessment.status,
      rationale: assessment.rationale,
    }),
  );

  const prompt = buildChatPrompt({
    question,
    prTitle: pr.title,
    prBody: pr.body,
    headSha: pr.headSha,
    diff: diffForPrompt,
    findings: boundChatFindings(
      openFindings.map((finding) => ({
        id: finding.id,
        file: finding.file,
        line: finding.line,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        status: finding.status,
      })),
    ),
    linkedIssues,
    thread: boundThreadComments(
      threadComments.map((comment, index) => ({
        id: index + 1,
        userLogin: comment.userLogin,
        body: comment.body,
      })),
    ).map((comment) => ({
      userLogin: comment.userLogin,
      body: comment.body,
    })),
    allowedFiles,
  });

  try {
    const generated = await dependencies.generateChat(
      prompt,
      { model },
      { deadline: startedAt + LLM_TIMEOUT_MS },
    );
    const filtered = filterChatReferences(generated.output, allowedFiles, allowedLines);
    await postReplyOnce(
      job,
      formatChatReply(filtered),
      dependencies,
      threadComments,
    );

    await dependencies.queries.markInteractionCompleted(
      job.installationId,
      job.interactionId,
      {
        model,
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
        durationMs: Date.now() - startedAt,
      },
    );

    return {
      kind: "question" as const,
      answered: true as const,
      model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
    };
  } catch (error) {
    if (error instanceof ReviewFailedError && !error.retryable) {
      await postReplyOnce(
        job,
        "I could not produce a reliable answer from the bounded PR context. Try asking about a specific file or finding.",
        dependencies,
        threadComments,
      );
      await dependencies.queries.markInteractionCompleted(
        job.installationId,
        job.interactionId,
        {
          model,
          inputTokens: null,
          outputTokens: null,
          durationMs: Date.now() - startedAt,
        },
      );
      return {
        kind: "question" as const,
        answered: false as const,
        reason: "generation_failed" as const,
      };
    }
    throw error;
  }
}

async function processConversationJob(
  job: ConversationJob,
  dependencies: ConversationWorkerDependencies,
) {
  const existing = await dependencies.queries.getInteractionById(
    job.installationId,
    job.interactionId,
  );
  if (!existing) {
    return { status: "ignored" as const, reason: "unknown_interaction" };
  }
  if (existing.status === "completed" || existing.status === "skipped") {
    return { status: "already_processed" as const };
  }

  const claimed = await dependencies.queries.claimInteractionRunning(
    job.installationId,
    job.interactionId,
  );
  if (!claimed) {
    return { status: "already_processing" as const };
  }

  const startedAt = Date.now();

  const sourceComment = await dependencies.github.fetchIssueComment(
    job.installationId,
    job.repoFullName,
    job.sourceCommentId,
  );
  if (sourceComment.status === "missing") {
    await dependencies.queries.markInteractionSkipped(
      job.installationId,
      job.interactionId,
      "comment_deleted",
    );
    return { status: "skipped" as const, reason: "comment_deleted" };
  }
  if (sourceComment.status !== "fetched") {
    await dependencies.queries.markInteractionFailed(
      job.installationId,
      job.interactionId,
      "comment_unavailable",
    );
    return { status: "failed" as const, reason: "comment_unavailable" };
  }

  const prAccess = await dependencies.github.fetchPullRequestAccessibility(
    job.installationId,
    job.repoFullName,
    job.prNumber,
  );
  if (prAccess.status !== "accessible") {
    await dependencies.queries.markInteractionSkipped(
      job.installationId,
      job.interactionId,
      prAccess.status === "missing" ? "pr_inaccessible" : "pr_unavailable",
    );
    return {
      status: "skipped" as const,
      reason: prAccess.status === "missing" ? "pr_inaccessible" : "pr_unavailable",
    };
  }
  if (prAccess.state.toLowerCase() !== "open") {
    await dependencies.queries.markInteractionSkipped(
      job.installationId,
      job.interactionId,
      "pr_closed",
    );
    return { status: "skipped" as const, reason: "pr_closed" };
  }

  const sourceAuthorMatchesJob =
    sourceComment.userLogin.localeCompare(job.actorLogin, undefined, {
      sensitivity: "accent",
    }) === 0;
  const pullRequestAuthorMatchesJob =
    prAccess.authorLogin.localeCompare(job.prAuthorLogin, undefined, {
      sensitivity: "accent",
    }) === 0;
  if (!sourceAuthorMatchesJob || !pullRequestAuthorMatchesJob) {
    await dependencies.queries.markInteractionSkipped(
      job.installationId,
      job.interactionId,
      "unauthorized",
    );
    return { status: "skipped" as const, reason: "unauthorized" };
  }

  const permission = await dependencies.github.getCollaboratorPermission(
    job.installationId,
    job.repoFullName,
    sourceComment.userLogin,
  );

  if (
    !actorMayStartConversation(
      permission,
      sourceComment.userLogin,
      prAccess.authorLogin,
    )
  ) {
    await dependencies.queries.markInteractionSkipped(
      job.installationId,
      job.interactionId,
      "unauthorized",
    );
    return { status: "skipped" as const, reason: "unauthorized" };
  }

  const threadResult = await dependencies.github.listIssueComments(
    job.installationId,
    job.repoFullName,
    job.prNumber,
  );
  const threadComments =
    threadResult.status === "fetched" ? threadResult.comments : [];

  const command = parseConversationCommand(sourceComment.body);

  if (command.kind === "empty") {
    await dependencies.queries.markInteractionSkipped(
      job.installationId,
      job.interactionId,
      "empty_command",
    );
    return { status: "skipped" as const, reason: "empty_command" };
  }

  if (command.kind === "feedback_redirect") {
    await postReplyOnce(
      job,
      feedbackRedirectAcknowledgement(command.action),
      dependencies,
      threadComments,
    );
    await dependencies.queries.markInteractionCompleted(
      job.installationId,
      job.interactionId,
      { durationMs: Date.now() - startedAt },
    );
    return {
      status: "completed" as const,
      kind: "feedback_redirect" as const,
      action: command.action,
    };
  }

  if (command.kind === "control") {
    if (
      !actorMayRunControl(
        command.action,
        permission,
      )
    ) {
      await postReplyOnce(
        job,
        "You need write access on this repository for that command.",
        dependencies,
        threadComments,
      );
      await dependencies.queries.markInteractionSkipped(
        job.installationId,
        job.interactionId,
        "unauthorized",
      );
      return { status: "skipped" as const, reason: "unauthorized" };
    }

    const result = await handleControlCommand(
      job,
      command.action,
      sourceComment.userLogin,
      {
        title: prAccess.title,
        body: prAccess.body,
        headSha: prAccess.headSha,
      },
      threadComments,
      dependencies,
    );

    await dependencies.queries.markInteractionCompleted(
      job.installationId,
      job.interactionId,
      { durationMs: Date.now() - startedAt },
    );

    return { status: "completed" as const, ...result };
  }

  // Free-form question — chat path (Feature 34).
  const chatResult = await handleChatQuestion(
    job,
    command.question,
    {
      title: prAccess.title,
      body: prAccess.body,
      headSha: prAccess.headSha,
      authorLogin: prAccess.authorLogin,
    },
    threadComments,
    dependencies,
    startedAt,
  );

  // markInteractionCompleted is handled inside handleChatQuestion on success.
  if (chatResult.answered || chatResult.reason === "generation_failed") {
    return { status: "completed" as const, ...chatResult };
  }

  await dependencies.queries.markInteractionCompleted(
    job.installationId,
    job.interactionId,
    { durationMs: Date.now() - startedAt },
  );
  return { status: "completed" as const, ...chatResult };
}

export async function handleConversationWorker(
  request: Request,
  dependencies: ConversationWorkerDependencies = createDefaultDependencies(),
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

  let job: ConversationJob;
  try {
    job = conversationJobSchema.parse(JSON.parse(body));
  } catch {
    return envelope(false, null, "Invalid conversation job.", 400);
  }

  try {
    const result = await processConversationJob(job, dependencies);
    return envelope(true, result, null, 200);
  } catch {
    try {
      await dependencies.queries.markInteractionFailed(
        job.installationId,
        job.interactionId,
        "processing_failed",
      );
    } catch {
      // Best-effort terminal status.
    }
    return envelope(false, null, "Conversation processing failed.", 500);
  }
}

export function createConversationWorkerDependencies() {
  return createDefaultDependencies();
}
