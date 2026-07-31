import { Receiver } from "@upstash/qstash";

import { parseEnv } from "@/lib/config/env";
import {
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
} from "@/lib/review/feedback-command";
import {
  feedbackJobSchema,
  type FeedbackAction,
  type FeedbackJob,
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
    },
    github: {
      getCollaboratorPermission,
      replyToPullRequestReviewComment,
    },
  };
}

/** Write-capable roles required for dismiss and false-positive. */
const DISMISS_PERMISSIONS = new Set<RepositoryPermission>([
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
  action: FeedbackAction,
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

  return DISMISS_PERMISSIONS.has(permission);
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

  try {
    await dependencies.github.replyToPullRequestReviewComment(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      job.sourceCommentId,
      feedbackAcknowledgement(job.action),
    );
  } catch {
    // State is already durable; acknowledgement is best-effort.
  }

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

  // Reason required for dismiss / false_positive; null only for valid.
  if (job.action === "valid" && job.reason !== null) {
    return envelope(false, null, "Invalid feedback job.", 400);
  }
  if (
    (job.action === "dismiss" || job.action === "false_positive") &&
    (job.reason === null || job.reason.length === 0)
  ) {
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
