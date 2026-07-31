import { describe, expect, it, vi } from "vitest";

import { createConversationTriggerHandler } from "@/lib/github/conversation-trigger";
import type { IssueCommentEvent } from "@/lib/github/events";

function baseEvent(
  overrides: Partial<IssueCommentEvent> = {},
): IssueCommentEvent {
  return {
    action: "created",
    installation: { id: 42 },
    repository: { id: 100, full_name: "owner/repo" },
    issue: {
      number: 7,
      pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/7" },
      user: { login: "author", type: "User" },
    },
    comment: {
      id: 9001,
      body: "@diffguard explain the auth risk",
      user: { login: "reviewer", type: "User" },
    },
    ...overrides,
  };
}

function createDeps(
  overrides: {
    created?: boolean;
    conversationsToday?: number;
    limitSuccess?: boolean;
  } = {},
) {
  const limitSuccess = overrides.limitSuccess ?? true;
  return {
    queries: {
      createQueuedInteraction: vi.fn().mockResolvedValue({
        interaction: { id: "11111111-1111-4111-8111-111111111111", status: "queued" },
        created: overrides.created ?? true,
      }),
      createSkippedInteraction: vi.fn().mockResolvedValue({
        interaction: { id: "11111111-1111-4111-8111-111111111111", status: "skipped" },
        created: true,
      }),
      countConversationsToday: vi
        .fn()
        .mockResolvedValue(overrides.conversationsToday ?? 0),
    },
    installationRateLimiter: {
      limit: vi.fn().mockResolvedValue({ success: limitSuccess }),
    },
    prRateLimiter: {
      limit: vi.fn().mockResolvedValue({ success: limitSuccess }),
    },
    actorRateLimiter: {
      limit: vi.fn().mockResolvedValue({ success: limitSuccess }),
    },
    qstash: {
      publishJSON: vi.fn().mockResolvedValue(undefined),
    },
    conversationWorkerUrl: "https://example.com/api/jobs/conversation",
  };
}

describe("conversation trigger", () => {
  it("queues a job for a human @diffguard mention on a PR", async () => {
    const deps = createDeps();
    const handle = createConversationTriggerHandler(deps);

    await expect(handle(baseEvent(), "delivery-1")).resolves.toEqual({
      status: "queued",
    });
    expect(deps.qstash.publishJSON).toHaveBeenCalledWith({
      url: "https://example.com/api/jobs/conversation",
      body: expect.objectContaining({
        installationId: 42,
        repositoryId: 100,
        prNumber: 7,
        sourceCommentId: 9001,
        actorLogin: "reviewer",
        prAuthorLogin: "author",
        interactionId: "11111111-1111-4111-8111-111111111111",
      }),
    });
  });

  it("ignores non-PR issues, bots, edits, and free-form comments", async () => {
    const deps = createDeps();
    const handle = createConversationTriggerHandler(deps);

    await expect(
      handle(
        baseEvent({
          issue: {
            number: 7,
            user: { login: "author", type: "User" },
          },
        }),
        "d1",
      ),
    ).resolves.toEqual({ status: "ignored" });

    await expect(
      handle(
        baseEvent({
          comment: {
            id: 1,
            body: "@diffguard hi",
            user: { login: "bot", type: "Bot" },
          },
        }),
        "d2",
      ),
    ).resolves.toEqual({ status: "ignored" });

    await expect(
      handle(baseEvent({ action: "edited" }), "d3"),
    ).resolves.toEqual({ status: "ignored" });

    await expect(
      handle(
        baseEvent({
          comment: {
            id: 2,
            body: "nice work",
            user: { login: "reviewer", type: "User" },
          },
        }),
        "d4",
      ),
    ).resolves.toEqual({ status: "ignored" });

    expect(deps.qstash.publishJSON).not.toHaveBeenCalled();
  });

  it("skips when rate limited or daily capped", async () => {
    const rateLimited = createDeps({ limitSuccess: false });
    const capped = createDeps({ conversationsToday: 10_000 });

    await expect(
      createConversationTriggerHandler(rateLimited)(baseEvent(), "d1"),
    ).resolves.toEqual({ status: "skipped", reason: "rate_limited" });
    expect(rateLimited.queries.createSkippedInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ error: "rate_limited" }),
    );

    await expect(
      createConversationTriggerHandler(capped)(baseEvent(), "d2"),
    ).resolves.toEqual({ status: "skipped", reason: "daily_cap" });
    expect(capped.queries.createSkippedInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ error: "daily_cap" }),
    );
  });

  it("is idempotent on duplicate source comment ids", async () => {
    const deps = createDeps({ created: false });
    await expect(
      createConversationTriggerHandler(deps)(baseEvent(), "d1"),
    ).resolves.toEqual({ status: "duplicate" });
    expect(deps.qstash.publishJSON).not.toHaveBeenCalled();
  });
});
