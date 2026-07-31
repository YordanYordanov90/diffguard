import { Receiver } from "@upstash/qstash";

import { parseEnv } from "@/lib/config/env";
import {
  claimInteractionRunning,
  getInteractionById,
  markInteractionCompleted,
  markInteractionFailed,
  markInteractionSkipped,
} from "@/lib/db/queries";
import {
  createIssueComment,
  fetchIssueComment,
  fetchPullRequestAccessibility,
  getCollaboratorPermission,
  listIssueComments,
  type RepositoryPermission,
} from "@/lib/github/client";
import {
  conversationJobSchema,
  type ConversationJob,
} from "@/lib/review/conversation-job";
import {
  boundThreadComments,
  CONVERSATION_BOUNDARY_ACK,
} from "@/lib/review/conversation-mention";

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
};

type ConversationGitHub = {
  getCollaboratorPermission: typeof getCollaboratorPermission;
  fetchIssueComment: typeof fetchIssueComment;
  fetchPullRequestAccessibility: typeof fetchPullRequestAccessibility;
  listIssueComments: typeof listIssueComments;
  createIssueComment: typeof createIssueComment;
};

export type ConversationWorkerDependencies = {
  qstash: QStashVerifier;
  queries: ConversationQueries;
  github: ConversationGitHub;
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

  return {
    qstash: receiver,
    queries: {
      getInteractionById,
      claimInteractionRunning,
      markInteractionCompleted,
      markInteractionFailed,
      markInteractionSkipped,
    },
    github: {
      getCollaboratorPermission,
      fetchIssueComment,
      fetchPullRequestAccessibility,
      listIssueComments,
      createIssueComment,
    },
  };
}

const COLLABORATOR_PERMISSIONS = new Set<RepositoryPermission>([
  "admin",
  "maintain",
  "write",
  "triage",
  "read",
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
  if (
    existing.status === "completed" ||
    existing.status === "failed" ||
    existing.status === "skipped"
  ) {
    return { status: "already_processed" as const };
  }

  const claimed = await dependencies.queries.claimInteractionRunning(
    job.installationId,
    job.interactionId,
  );
  if (!claimed && existing.status !== "running") {
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
  if (sourceComment.status === "unavailable") {
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

  let permission: RepositoryPermission;
  try {
    permission = await dependencies.github.getCollaboratorPermission(
      job.installationId,
      job.repoFullName,
      job.actorLogin,
    );
  } catch {
    await dependencies.queries.markInteractionFailed(
      job.installationId,
      job.interactionId,
      "permission_check_failed",
    );
    return { status: "failed" as const, reason: "permission_check_failed" };
  }

  if (
    !actorMayStartConversation(permission, job.actorLogin, job.prAuthorLogin)
  ) {
    await dependencies.queries.markInteractionSkipped(
      job.installationId,
      job.interactionId,
      "unauthorized",
    );
    return { status: "skipped" as const, reason: "unauthorized" };
  }

  // Ephemeral thread context for Feature 34; discarded after this request.
  const thread = await dependencies.github.listIssueComments(
    job.installationId,
    job.repoFullName,
    job.prNumber,
  );
  if (thread.status === "fetched") {
    boundThreadComments(thread.comments);
  }

  try {
    await dependencies.github.createIssueComment(
      job.installationId,
      job.repoFullName,
      job.prNumber,
      CONVERSATION_BOUNDARY_ACK,
    );
  } catch {
    // Issues: write may be missing; boundary still completes without a reply.
  }

  await dependencies.queries.markInteractionCompleted(
    job.installationId,
    job.interactionId,
    {
      model: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - startedAt,
    },
  );

  return {
    status: "completed" as const,
    // Feature 34 will answer with the LLM; boundary only acknowledges.
    answered: false,
  };
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
