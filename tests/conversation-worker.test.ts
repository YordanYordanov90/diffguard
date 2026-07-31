import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  actorMayStartConversation,
  getConversationAcknowledgementMarker,
  handleConversationWorker,
} from "@/lib/workers/conversation";
import type { ConversationJob } from "@/lib/review/conversation-job";
import { CONVERSATION_BOUNDARY_ACK } from "@/lib/review/conversation-mention";

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
    commentStatus?: "fetched" | "missing" | "unavailable";
    prStatus?: "accessible" | "missing" | "unavailable";
    permission?: "admin" | "maintain" | "write" | "triage" | "read" | "none";
  } = {},
) {
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
                body: "@diffguard explain",
                userLogin: "reviewer",
              },
      ),
      fetchPullRequestAccessibility: vi.fn().mockResolvedValue({
        status: overrides.prStatus ?? "accessible",
        ...(overrides.prStatus === undefined ? { authorLogin: "author" } : {}),
      }),
      listIssueComments: vi.fn().mockResolvedValue({
        status: "fetched",
        comments: [
          { id: 1, body: "prior", userLogin: "author" },
          { id: 9001, body: "@diffguard explain", userLogin: "reviewer" },
        ],
      }),
      createIssueComment: vi.fn().mockResolvedValue(9002),
    },
  };
}

describe("actorMayStartConversation", () => {
  it("allows PR authors and collaborators", () => {
    expect(actorMayStartConversation("none", "author", "author")).toBe(true);
    expect(actorMayStartConversation("read", "reader", "author")).toBe(true);
    expect(actorMayStartConversation("none", "stranger", "author")).toBe(false);
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

  it("completes the boundary without an LLM answer", async () => {
    const dependencies = createDependencies();
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "completed", answered: false },
      error: null,
    });
    expect(dependencies.github.createIssueComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      expect.stringContaining(CONVERSATION_BOUNDARY_ACK),
    );
    expect(dependencies.github.createIssueComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      expect.stringMatching(/<!-- diffguard-ack:[0-9a-f]{24} -->/),
    );
    expect(dependencies.queries.markInteractionCompleted).toHaveBeenCalled();
    // Thread was loaded ephemerally; no persistence of bodies.
    expect(dependencies.github.listIssueComments).toHaveBeenCalled();
  });

  it("skips deleted comments and inaccessible PRs", async () => {
    const deleted = createDependencies({ commentStatus: "missing" });
    const closed = createDependencies({ prStatus: "missing" });

    await expect(
      handleConversationWorker(signedRequest(baseJob), deleted),
    ).resolves.toMatchObject({ status: 200 });
    expect(deleted.queries.markInteractionSkipped).toHaveBeenCalledWith(
      42,
      baseJob.interactionId,
      "comment_deleted",
    );

    await expect(
      handleConversationWorker(signedRequest(baseJob), closed),
    ).resolves.toMatchObject({ status: 200 });
    expect(closed.queries.markInteractionSkipped).toHaveBeenCalledWith(
      42,
      baseJob.interactionId,
      "pr_inaccessible",
    );
  });

  it("skips unauthorized actors without posting a reply", async () => {
    const dependencies = createDependencies({ permission: "none" });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: "skipped", reason: "unauthorized" },
    });
    expect(dependencies.github.createIssueComment).not.toHaveBeenCalled();
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

  it("does not perform side effects when the atomic claim is lost", async () => {
    const dependencies = createDependencies({ claimResult: null });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "already_processing" },
      error: null,
    });
    expect(dependencies.github.fetchIssueComment).not.toHaveBeenCalled();
    expect(dependencies.github.createIssueComment).not.toHaveBeenCalled();
  });

  it("does not duplicate an acknowledgement after a retry", async () => {
    const dependencies = createDependencies();
    dependencies.github.listIssueComments.mockResolvedValueOnce({
      status: "fetched",
      comments: [
        {
          id: 9002,
          body: getConversationAcknowledgementMarker(baseJob),
          userLogin: "diffguard-dev[bot]",
        },
      ],
    });

    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(dependencies.github.createIssueComment).not.toHaveBeenCalled();
    expect(dependencies.queries.markInteractionCompleted).toHaveBeenCalled();
  });

  it("reclaims a failed interaction when a retry wins the claim", async () => {
    const dependencies = createDependencies({ interactionStatus: "failed" });
    const response = await handleConversationWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: "completed" },
    });
    expect(dependencies.queries.claimInteractionRunning).toHaveBeenCalled();
  });

  it("rejects jobs whose webhook authors no longer match GitHub", async () => {
    const dependencies = createDependencies();
    const response = await handleConversationWorker(
      signedRequest({ ...baseJob, actorLogin: "attacker" }),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: "skipped", reason: "unauthorized" },
    });
    expect(dependencies.github.getCollaboratorPermission).not.toHaveBeenCalled();
    expect(dependencies.github.createIssueComment).not.toHaveBeenCalled();
  });
});
