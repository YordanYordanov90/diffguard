import { describe, expect, it, vi } from "vitest";

import { createFeedbackTriggerHandler } from "@/lib/github/feedback-trigger";
import type { PullRequestReviewCommentEvent } from "@/lib/github/events";

function baseEvent(
  overrides: Partial<PullRequestReviewCommentEvent> = {},
): PullRequestReviewCommentEvent {
  return {
    action: "created",
    installation: { id: 42 },
    repository: { id: 100, full_name: "owner/repo" },
    pull_request: {
      number: 7,
      user: { login: "author", type: "User" },
    },
    comment: {
      id: 9001,
      body: "@diffguard valid",
      user: { login: "reviewer", type: "User" },
      in_reply_to_id: 7001,
    },
    ...overrides,
  };
}

describe("feedback trigger", () => {
  it("queues recognized commands on newly created human replies", async () => {
    const publishJSON = vi.fn().mockResolvedValue(undefined);
    const handle = createFeedbackTriggerHandler({
      qstash: { publishJSON },
      feedbackWorkerUrl: "https://example.com/api/jobs/feedback",
    });

    await expect(handle(baseEvent(), "delivery-1")).resolves.toEqual({
      status: "queued",
    });

    expect(publishJSON).toHaveBeenCalledWith({
      url: "https://example.com/api/jobs/feedback",
      body: {
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
      },
    });
  });

  it("queues remember commands for write-capable processing", async () => {
    const publishJSON = vi.fn().mockResolvedValue(undefined);
    const handle = createFeedbackTriggerHandler({
      qstash: { publishJSON },
      feedbackWorkerUrl: "https://example.com/api/jobs/feedback",
    });

    await expect(
      handle(
        baseEvent({
          comment: {
            id: 9002,
            body: "@diffguard remember: Prefer explicit tenant checks.",
            user: { login: "maintainer", type: "User" },
            in_reply_to_id: 7001,
          },
        }),
        "delivery-2",
      ),
    ).resolves.toEqual({ status: "queued" });

    expect(publishJSON).toHaveBeenCalledWith({
      url: "https://example.com/api/jobs/feedback",
      body: expect.objectContaining({
        action: "remember",
        reason: "Prefer explicit tenant checks.",
        sourceCommentId: 9002,
      }),
    });
  });

  it("ignores edits, deletes, bots, non-replies, and free-form text", async () => {
    const publishJSON = vi.fn();
    const handle = createFeedbackTriggerHandler({
      qstash: { publishJSON },
      feedbackWorkerUrl: "https://example.com/api/jobs/feedback",
    });

    await expect(
      handle(baseEvent({ action: "edited" }), "d1"),
    ).resolves.toEqual({ status: "ignored" });
    await expect(
      handle(baseEvent({ action: "deleted" }), "d2"),
    ).resolves.toEqual({ status: "ignored" });
    await expect(
      handle(
        baseEvent({
          comment: {
            id: 1,
            body: "@diffguard valid",
            user: { login: "diffguard[bot]", type: "Bot" },
            in_reply_to_id: 7001,
          },
        }),
        "d3",
      ),
    ).resolves.toEqual({ status: "ignored" });
    await expect(
      handle(
        baseEvent({
          comment: {
            id: 2,
            body: "@diffguard valid",
            user: { login: "reviewer", type: "User" },
            in_reply_to_id: null,
          },
        }),
        "d4",
      ),
    ).resolves.toEqual({ status: "ignored" });
    await expect(
      handle(
        baseEvent({
          comment: {
            id: 3,
            body: "this is free form chat",
            user: { login: "reviewer", type: "User" },
            in_reply_to_id: 7001,
          },
        }),
        "d5",
      ),
    ).resolves.toEqual({ status: "ignored" });

    expect(publishJSON).not.toHaveBeenCalled();
  });
});
