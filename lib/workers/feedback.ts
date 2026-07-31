import { Receiver } from "@upstash/qstash";

import {
  FEEDBACK_REASON_MAX_CHARS,
  LEARNING_GUIDANCE_MAX_CHARS,
} from "@/lib/config/constants";
import { parseEnv } from "@/lib/config/env";
import {
  createRepositoryLearning,
  getFindingByGitHubCommentId,
  recordFindingFeedback,
} from "@/lib/db/queries";
import {
  getCollaboratorPermission,
  replyToPullRequestReviewComment,
  type RepositoryPermission,
} from "@/lib/github/client";
import {
  feedbackAcknowledgement,
  feedbackActionDismisses,
  feedbackActionRequiresWriteAccess,
} from "@/lib/review/feedback-command";
import {
  feedbackJobSchema,
  type FeedbackJob,
  type FeedbackJobAction,
} from "@/lib/review/feedback-job";

type QStashVerifier = {
  verify: (request: {
    signature: string;
    body: string;
    url: string;
  }) => Promise<boolean>;
};

type FeedbackQueries = {
  getFindingByGitHubCommentId: typeof getFindingByGitHubCommentId;
  recordFindingFeedback: typeof recordFindingFeedback;
  createRepositoryLearning: typeof createRepositoryLearning;
};

type FeedbackGitHub = {
  getCollaboratorPermission: typeof getCollaboratorPermission;
  replyToPullRequestReviewComment: typeof replyToPullRequestReviewComment;
};

export type FeedbackWorkerDependencies = {
  qstash: QStashVerifier;
  queries: FeedbackQueries;
  github: FeedbackGitHub;
};

function envelope(
  success: boolean,
  data: unknown,
  error: string | null,
  status: number,
) {
  return Response.json({ success, data, error }, { status });
}

function createDefaultDependencies(): FeedbackWorkerDependencies {
  const env = parseEnv();
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });

  return {
    qstash: receiver,
    queries: {
      getFindingByGitHubCommentId,
      recordFindingFeedback,
      createRepositoryLearning,
    },
    github: {
      getCollaboratorPermission,
      replyToPullRequestReviewComment,
    },
  };
}

/** Write-capable roles required for dismiss, false-positive, and remember. */
const WRITE_PERMISSIONS = new Set<RepositoryPermission>([
  "admin",
  "maintain",
  "write",
]);

/** Collaborator roles that may record a valid signal (plus PR author). */
const VALID_COLLABORATOR_PERMISSIONS = new Set<RepositoryPermission>([
  "admin",
  "maintain",
  "write",
  "triage",
  "read",
]);

export function actorMayRecordFeedback(
  action: FeedbackJobAction,
  permission: RepositoryPermission,
  actorLogin: string,
  prAuthorLogin: string,
): boolean {
  const isPrAuthor =
    actorLogin.localeCompare(prAuthorLogin, undefined, {
      sensitivity: "accent",
    }) === 0;

  if (action === "valid") {
    return isPrAuthor || VALID_COLLABORATOR_PERMISSIONS.has(permission);
  }

  if (feedbackActionRequiresWriteAccess(action)) {
    return WRITE_PERMISSIONS.has(permission);
  }

  return false;
}

function isJobReasonValid(job: FeedbackJob): boolean {
  if (job.action === "valid") return job.reason === null;
  if (job.reason === null || job.reason.length === 0) return false;
  if (job.action === "remember") {
    return job.reason.length <= LEARNING_GUIDANCE_MAX_CHARS;
  }
  return job.reason.length <= FEEDBACK_REASON_MAX_CHARS;
}

async function acknowledge(
  job: FeedbackJob,
  dependencies: FeedbackWorkerDependencies,
  action: FeedbackJobAction,
) {
  try {
    // GitHub only accepts replies under the top-level review comment, not
    // replies-to-replies. sourceCommentId is the user's command reply.
    await dependencies.github.replyToPullRequestReviewComment(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      job.parentCommentId,
      feedbackAcknowledgement(action),
    );
  } catch {
    // State is already durable; acknowledgement is best-effort.
  }
}

async function processRememberJob(
  job: FeedbackJob,
  findingId: string,
  dependencies: FeedbackWorkerDependencies,
) {
  if (!job.reason) {
    return { status: "ignored" as const, reason: "invalid_guidance" };
  }

  const result = await dependencies.queries.createRepositoryLearning({
    installationId: job.installationId,
    repositoryId: job.repositoryId,
    guidance: job.reason,
    createdBy: job.actorLogin,
    sourceFindingId: findingId,
    sourceCommentId: job.sourceCommentId,
  });

  if (result.status === "invalid_guidance") {
    return { status: "ignored" as const, reason: "invalid_guidance" };
  }
  if (result.status === "repository_not_found") {
    return { status: "ignored" as const, reason: "repository_not_found" };
  }
  if (result.status === "quota_exceeded") {
    return { status: "ignored" as const, reason: "quota_exceeded" };
  }
  if (result.status === "duplicate") {
    // Prefer acknowledging so the collaborator knows the preference is already stored.
    await acknowledge(job, dependencies, "remember");
    return { status: "duplicate" as const, kind: "learning" as const };
  }

  await acknowledge(job, dependencies, "remember");
  return {
    status: "recorded" as const,
    action: "remember" as const,
    learningId: result.learning.id,
  };
}

async function processFeedbackJob(
  job: FeedbackJob,
  dependencies: FeedbackWorkerDependencies,
) {
  const finding = await dependencies.queries.getFindingByGitHubCommentId(
    job.installationId,
    job.repositoryId,
    job.prNumber,
    job.parentCommentId,
  );

  if (!finding) {
    return { status: "ignored" as const, reason: "unknown_parent" };
  }

  const permission = await dependencies.github.getCollaboratorPermission(
    job.installationId,
    job.repoFullName,
    job.actorLogin,
  );

  if (
    !actorMayRecordFeedback(
      job.action,
      permission,
      job.actorLogin,
      job.prAuthorLogin,
    )
  ) {
    return { status: "ignored" as const, reason: "unauthorized" };
  }

  if (job.action === "remember") {
    return processRememberJob(job, finding.id, dependencies);
  }

  const dismissFinding = feedbackActionDismisses(job.action);
  const result = await dependencies.queries.recordFindingFeedback({
    installationId: job.installationId,
    repositoryId: job.repositoryId,
    prNumber: job.prNumber,
    findingId: finding.id,
    sourceCommentId: job.sourceCommentId,
    actorLogin: job.actorLogin,
    action: job.action,
    reason: job.reason,
    dismissFinding,
  });

  if (!result.recorded) {
    return { status: "duplicate" as const };
  }

  await acknowledge(job, dependencies, job.action);

  return {
    status: "recorded" as const,
    action: job.action,
    dismissed: result.dismissed,
  };
}

export async function handleFeedbackWorker(
  request: Request,
  dependencies: FeedbackWorkerDependencies = createDefaultDependencies(),
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

  let job: FeedbackJob;
  try {
    job = feedbackJobSchema.parse(JSON.parse(body));
  } catch {
    return envelope(false, null, "Invalid feedback job.", 400);
  }

  if (!isJobReasonValid(job)) {
    return envelope(false, null, "Invalid feedback job.", 400);
  }

  try {
    const result = await processFeedbackJob(job, dependencies);
    return envelope(true, result, null, 200);
  } catch {
    return envelope(false, null, "Feedback processing failed.", 500);
  }
}

export function createFeedbackWorkerDependencies() {
  return createDefaultDependencies();
}
