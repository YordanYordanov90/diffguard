import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  actorMayRecordFeedback,
  handleFeedbackWorker,
} from "@/lib/workers/feedback";
import type { FeedbackJob } from "@/lib/review/feedback-job";

const baseJob: FeedbackJob = {
  installationId: 42,
  repositoryId: 100,
  repoFullName: "owner/repo",
  prNumber: 7,
  parentCommentId: 7001,
  sourceCommentId: 9001,
  actorLogin: "reviewer",
  prAuthorLogin: "author",
  action: "valid",
  reason: null,
  deliveryId: "delivery-1",
};

function signedRequest(job: FeedbackJob) {
  return new Request("http://localhost/api/jobs/feedback", {
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
    finding?: { id: string } | null;
    permission?: "admin" | "maintain" | "write" | "triage" | "read" | "none";
    recorded?: boolean;
    dismissed?: boolean;
    createLearning?: unknown;
  } = {},
) {
  return {
    qstash: {
      verify: vi.fn().mockResolvedValue(true),
    },
    queries: {
      getFindingByGitHubCommentId: vi
        .fn()
        .mockResolvedValue(
          overrides.finding === undefined
            ? { id: "finding-1" }
            : overrides.finding,
        ),
      recordFindingFeedback: vi.fn().mockResolvedValue({
        recorded: overrides.recorded ?? true,
        dismissed: overrides.dismissed ?? false,
      }),
      createRepositoryLearning: vi.fn().mockResolvedValue(
        overrides.createLearning ?? {
          status: "created",
          learning: { id: "learning-1" },
        },
      ),
    },
    github: {
      getCollaboratorPermission: vi
        .fn()
        .mockResolvedValue(overrides.permission ?? "write"),
      replyToPullRequestReviewComment: vi.fn().mockResolvedValue(9002),
    },
  };
}

describe("actorMayRecordFeedback", () => {
  it("allows valid from the PR author or any collaborator", () => {
    expect(
      actorMayRecordFeedback("valid", "none", "author", "author"),
    ).toBe(true);
    expect(actorMayRecordFeedback("valid", "read", "reader", "author")).toBe(
      true,
    );
    expect(actorMayRecordFeedback("valid", "triage", "triager", "author")).toBe(
      true,
    );
    expect(actorMayRecordFeedback("valid", "none", "stranger", "author")).toBe(
      false,
    );
  });

  it("requires write/maintain/admin for dismiss, false-positive, and remember", () => {
    expect(
      actorMayRecordFeedback("dismiss", "write", "dev", "author"),
    ).toBe(true);
    expect(
      actorMayRecordFeedback("false_positive", "maintain", "maint", "author"),
    ).toBe(true);
    expect(
      actorMayRecordFeedback("remember", "admin", "admin", "author"),
    ).toBe(true);
    expect(
      actorMayRecordFeedback("dismiss", "read", "reader", "author"),
    ).toBe(false);
    expect(
      actorMayRecordFeedback("dismiss", "triage", "triager", "author"),
    ).toBe(false);
    expect(
      actorMayRecordFeedback("false_positive", "none", "author", "author"),
    ).toBe(false);
    expect(
      actorMayRecordFeedback("remember", "read", "author", "author"),
    ).toBe(false);
  });
});

describe("feedback worker", () => {
  it("rejects invalid signatures", async () => {
    const dependencies = createDependencies();
    dependencies.qstash.verify.mockResolvedValue(false);

    const response = await handleFeedbackWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(401);
    expect(dependencies.queries.getFindingByGitHubCommentId).not.toHaveBeenCalled();
  });

  it("records a valid signal and acknowledges without dismissing", async () => {
    const dependencies = createDependencies({ permission: "read" });

    const response = await handleFeedbackWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "recorded", action: "valid", dismissed: false },
      error: null,
    });
    expect(dependencies.queries.recordFindingFeedback).toHaveBeenCalledWith({
      installationId: 42,
      repositoryId: 100,
      prNumber: 7,
      findingId: "finding-1",
      sourceCommentId: 9001,
      actorLogin: "reviewer",
      action: "valid",
      reason: null,
      dismissFinding: false,
    });
    expect(dependencies.github.replyToPullRequestReviewComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      7001,
      "Recorded as useful. Thanks for the signal.",
    );
  });

  it("dismisses on false-positive when the actor has write access", async () => {
    const dependencies = createDependencies({
      permission: "write",
      dismissed: true,
    });
    const job: FeedbackJob = {
      ...baseJob,
      action: "false_positive",
      reason: "intentional sibling control",
    };

    const response = await handleFeedbackWorker(
      signedRequest(job),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: "recorded", action: "false_positive", dismissed: true },
    });
    expect(dependencies.queries.recordFindingFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "false_positive",
        reason: "intentional sibling control",
        dismissFinding: true,
      }),
    );
  });

  it("ignores non-DiffGuard parents and unauthorized actors without leaking details", async () => {
    const missingParent = createDependencies({ finding: null });
    const unauthorized = createDependencies({ permission: "read" });
    const dismissJob: FeedbackJob = {
      ...baseJob,
      action: "dismiss",
      reason: "not needed",
    };

    const missingResponse = await handleFeedbackWorker(
      signedRequest(baseJob),
      missingParent,
    );
    const unauthorizedResponse = await handleFeedbackWorker(
      signedRequest(dismissJob),
      unauthorized,
    );

    expect(missingResponse.status).toBe(200);
    await expect(missingResponse.json()).resolves.toEqual({
      success: true,
      data: { status: "ignored", reason: "unknown_parent" },
      error: null,
    });
    expect(missingParent.queries.recordFindingFeedback).not.toHaveBeenCalled();
    expect(
      missingParent.github.replyToPullRequestReviewComment,
    ).not.toHaveBeenCalled();

    expect(unauthorizedResponse.status).toBe(200);
    await expect(unauthorizedResponse.json()).resolves.toEqual({
      success: true,
      data: { status: "ignored", reason: "unauthorized" },
      error: null,
    });
    expect(unauthorized.queries.recordFindingFeedback).not.toHaveBeenCalled();
    expect(
      unauthorized.github.replyToPullRequestReviewComment,
    ).not.toHaveBeenCalled();
  });

  it("is idempotent on duplicate source comments", async () => {
    const dependencies = createDependencies({ recorded: false });

    const response = await handleFeedbackWorker(
      signedRequest(baseJob),
      dependencies,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "duplicate" },
      error: null,
    });
    expect(
      dependencies.github.replyToPullRequestReviewComment,
    ).not.toHaveBeenCalled();
  });

  it("scopes finding lookup to installation, repository, and PR", async () => {
    const dependencies = createDependencies();
    await handleFeedbackWorker(signedRequest(baseJob), dependencies);

    expect(dependencies.queries.getFindingByGitHubCommentId).toHaveBeenCalledWith(
      42,
      100,
      7,
      7001,
    );
  });

  it("creates a repository learning from remember without dismissing", async () => {
    const dependencies = createDependencies({ permission: "write" });
    const job: FeedbackJob = {
      ...baseJob,
      action: "remember",
      reason: "Treat sibling keyboard controls as intentional UX.",
    };

    const response = await handleFeedbackWorker(signedRequest(job), dependencies);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        status: "recorded",
        action: "remember",
        learningId: "learning-1",
      },
      error: null,
    });
    expect(dependencies.queries.createRepositoryLearning).toHaveBeenCalledWith({
      installationId: 42,
      repositoryId: 100,
      guidance: "Treat sibling keyboard controls as intentional UX.",
      createdBy: "reviewer",
      sourceFindingId: "finding-1",
      sourceCommentId: 9001,
    });
    expect(dependencies.queries.recordFindingFeedback).not.toHaveBeenCalled();
    expect(dependencies.github.replyToPullRequestReviewComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      7001,
      "Saved repository preference.",
    );
  });

  it("ignores unauthorized remember attempts", async () => {
    const dependencies = createDependencies({ permission: "read" });
    const job: FeedbackJob = {
      ...baseJob,
      action: "remember",
      reason: "Prefer REST.",
    };

    const response = await handleFeedbackWorker(signedRequest(job), dependencies);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "ignored", reason: "unauthorized" },
      error: null,
    });
    expect(dependencies.queries.createRepositoryLearning).not.toHaveBeenCalled();
  });

  it("does not create a learning from false-positive alone", async () => {
    const dependencies = createDependencies({
      permission: "write",
      dismissed: true,
    });
    const job: FeedbackJob = {
      ...baseJob,
      action: "false_positive",
      reason: "intentional sibling control",
    };

    await handleFeedbackWorker(signedRequest(job), dependencies);

    expect(dependencies.queries.createRepositoryLearning).not.toHaveBeenCalled();
    expect(dependencies.queries.recordFindingFeedback).toHaveBeenCalled();
  });
});
