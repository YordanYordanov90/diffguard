import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  actorMayRunControl,
  actorMayStartConversation,
  getConversationReplyMarker,
  handleConversationWorker,
} from "@/lib/workers/conversation";
import type { ConversationJob } from "@/lib/review/conversation-job";

const headSha = "0123456789abcdef0123456789abcdef01234567";

const baseJob: ConversationJob = {
  installationId: 42,
  repositoryId: 100,
  repoFullName: "owner/repo",
  prNumber: 7,
  sourceCommentId: 9001,
  actorLogin: "reviewer",
  prAuthorLogin: "author",
  deliveryId: "delivery-1",
  interactionId: "11111111-1111-4111-8111-111111111111",
};

function signedRequest(job: ConversationJob) {
  return new Request("http://localhost/api/jobs/conversation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "upstash-signature": "sig",
    },
    body: JSON.stringify(job),
  });
}

function createDependencies(
  overrides: {
    interactionStatus?: string;
    claimResult?: { id: string; status: "running" } | null;
    commentBody?: string;
    commentStatus?: "fetched" | "missing" | "unavailable";
    prStatus?: "accessible" | "missing" | "unavailable";
    prState?: "open" | "closed";
    permission?: "admin" | "maintain" | "write" | "triage" | "read" | "none";
  } = {},
) {
  const commentBody = overrides.commentBody ?? "@diffguard explain the risk";
  return {
    qstash: {
      verify: vi.fn().mockResolvedValue(true),
    },
    queries: {
      getInteractionById: vi.fn().mockResolvedValue({
        id: baseJob.interactionId,
        status: overrides.interactionStatus ?? "queued",
      }),
      claimInteractionRunning: vi.fn().mockResolvedValue(
        overrides.claimResult === undefined
          ? { id: baseJob.interactionId, status: "running" }
          : overrides.claimResult,
      ),
      markInteractionCompleted: vi.fn().mockResolvedValue({ id: baseJob.interactionId }),
      markInteractionFailed: vi.fn().mockResolvedValue({ id: baseJob.interactionId }),
      markInteractionSkipped: vi.fn().mockResolvedValue({ id: baseJob.interactionId }),
      setPrReviewPaused: vi.fn().mockResolvedValue({ paused: true }),
      isPrReviewPaused: vi.fn().mockResolvedValue(false),
      createQueuedReview: vi.fn().mockResolvedValue({
        created: true,
        review: { id: "review-1", status: "queued" },
      }),
      countReviewsToday: vi.fn().mockResolvedValue(0),
      getInstallationModel: vi.fn().mockResolvedValue("openai/test"),
      listOpenFindingsByPr: vi.fn().mockResolvedValue([
        {
          id: "finding-1",
          file: "src/auth.ts",
          line: 12,
          severity: "high",
          title: "Missing auth",
          detail: "Detail",
          status: "open",
        },
      ]),
      getLatestCompletedReviewForPr: vi.fn().mockResolvedValue({
        linkedIssueAssessments: [],
      }),
    },
    github: {
      getCollaboratorPermission: vi
        .fn()
        .mockResolvedValue(overrides.permission ?? "write"),
      fetchIssueComment: vi.fn().mockResolvedValue(
        overrides.commentStatus === "missing"
          ? { status: "missing" }
          : overrides.commentStatus === "unavailable"
            ? { status: "unavailable" }
            : {
                status: "fetched",
                id: 9001,
                body: commentBody,
                userLogin: "reviewer",
              },
      ),
      fetchPullRequestAccessibility: vi.fn().mockResolvedValue(
        overrides.prStatus === "missing"
          ? { status: "missing" }
          : overrides.prStatus === "unavailable"
            ? { status: "unavailable" }
            : {
                status: "accessible",
                authorLogin: "author",
                title: "Harden auth",
                body: "Please review.",
                headSha,
                state: overrides.prState ?? "open",
              },
      ),
      listIssueComments: vi.fn().mockResolvedValue({
        status: "fetched",
        comments: [
          { id: 1, body: "prior", userLogin: "author" },
          { id: 9001, body: commentBody, userLogin: "reviewer" },
        ],
      }),
      createIssueComment: vi.fn().mockResolvedValue(9002),
      fetchPrDiff: vi
        .fn()
        .mockResolvedValue(
          "diff --git a/src/auth.ts b/src/auth.ts\n@@ -1 +1 @@\n+return true;\n",
        ),
    },
    generateChat: vi.fn().mockResolvedValue({
      output: {
        answer: "The handler validates ownership on the open finding path.",
        references: [{ file: "src/auth.ts", line: 12 }],
      },
      usage: { inputTokens: 100, outputTokens: 40 },
      durationMs: 12,
    }),
    reviewPublisher: {
      publishJSON: vi.fn().mockResolvedValue(undefined),
    },
    reviewWorkerUrl: "https://example.com/api/jobs/review",
  };
}

describe("actor permissions", () => {
  it("allows read-only chat while restricting manual reviews", () => {
    expect(actorMayStartConversation("read", "reader", "author")).toBe(true);
    expect(actorMayRunControl("review", "read", "reader", "author")).toBe(false);
    expect(actorMayRunControl("review", "none", "author", "author")).toBe(true);
    expect(actorMayRunControl("review", "write", "reviewer", "author")).toBe(true);
    expect(actorMayRunControl("pause", "read", "reader", "author")).toBe(false);
    expect(actorMayRunControl("full_review", "write", "dev", "author")).toBe(true);
  });
});

describe("conversation worker", () => {
  it("rejects invalid signatures before processing", async () => {
    const dependencies = createDependencies();
    dependencies.qstash.verify.mockResolvedValue(false);

    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(401);
    expect(dependencies.queries.getInteractionById).not.toHaveBeenCalled();
  });

  it("answers free-form questions with structured chat", async () => {
    const dependencies = createDependencies();
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: "completed", kind: "question", answered: true },
    });
    expect(dependencies.generateChat).toHaveBeenCalled();
    expect(dependencies.github.createIssueComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      expect.stringContaining("validates ownership"),
    );
    expect(dependencies.queries.markInteractionCompleted).toHaveBeenCalledWith(
      42,
      baseJob.interactionId,
      expect.objectContaining({
        model: "openai/test",
        inputTokens: 100,
        outputTokens: 40,
      }),
    );
  });

  it("pauses automatic reviews for write collaborators", async () => {
    const dependencies = createDependencies({
      commentBody: "@diffguard pause",
    });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(dependencies.queries.setPrReviewPaused).toHaveBeenCalledWith(
      42,
      100,
      7,
      true,
      "reviewer",
    );
    expect(dependencies.generateChat).not.toHaveBeenCalled();
    expect(dependencies.github.createIssueComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      expect.stringContaining("paused"),
    );
  });

  it("queues a full review when authorized", async () => {
    const dependencies = createDependencies({
      commentBody: "@diffguard full review",
    });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(dependencies.reviewPublisher.publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          forceFullReview: true,
          headSha,
        }),
      }),
    );
    expect(dependencies.generateChat).not.toHaveBeenCalled();
  });

  it("redirects feedback commands away from the chat model", async () => {
    const dependencies = createDependencies({
      commentBody: "@diffguard dismiss: noise",
    });
    await handleConversationWorker(signedRequest(baseJob), dependencies);

    expect(dependencies.generateChat).not.toHaveBeenCalled();
    expect(dependencies.github.createIssueComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      expect.stringContaining("inline finding"),
    );
  });

  it("skips unauthorized full review without queueing", async () => {
    const dependencies = createDependencies({
      commentBody: "@diffguard full review",
      permission: "read",
    });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { status: "skipped", reason: "unauthorized" },
    });
    expect(dependencies.reviewPublisher.publishJSON).not.toHaveBeenCalled();
  });

  it("skips unauthorized normal review from a read-only collaborator", async () => {
    const dependencies = createDependencies({
      commentBody: "@diffguard review",
      permission: "read",
    });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    await expect(response.json()).resolves.toMatchObject({
      data: { status: "skipped", reason: "unauthorized" },
    });
    expect(dependencies.reviewPublisher.publishJSON).not.toHaveBeenCalled();
  });

  it("skips deleted comments and inaccessible PRs", async () => {
    const deleted = createDependencies({ commentStatus: "missing" });
    await handleConversationWorker(signedRequest(baseJob), deleted);
    expect(deleted.queries.markInteractionSkipped).toHaveBeenCalledWith(
      42,
      baseJob.interactionId,
      "comment_deleted",
    );

    const closed = createDependencies({ prState: "closed" });
    await handleConversationWorker(signedRequest(baseJob), closed);
    expect(closed.queries.markInteractionSkipped).toHaveBeenCalledWith(
      42,
      baseJob.interactionId,
      "pr_closed",
    );
    expect(closed.generateChat).not.toHaveBeenCalled();
  });

  it("keeps transient reply failures retryable", async () => {
    const dependencies = createDependencies();
    dependencies.github.createIssueComment.mockRejectedValue(new Error("timeout"));

    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(500);
    expect(dependencies.queries.markInteractionFailed).toHaveBeenCalledWith(
      42,
      baseJob.interactionId,
      "processing_failed",
    );
    expect(dependencies.queries.markInteractionCompleted).not.toHaveBeenCalled();
  });

  it("is idempotent for already terminal interactions", async () => {
    const dependencies = createDependencies({ interactionStatus: "completed" });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "already_processed" },
      error: null,
    });
    expect(dependencies.queries.claimInteractionRunning).not.toHaveBeenCalled();
  });

  it("uses a stable reply marker for dedupe", () => {
    expect(getConversationReplyMarker(baseJob)).toMatch(
      /^<!-- diffguard-reply:[a-f0-9]{24} -->$/,
    );
  });
});
