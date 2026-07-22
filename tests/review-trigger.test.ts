import { describe, expect, it, vi } from "vitest";

import {
  createReviewTriggerHandler,
  type ReviewTriggerDependencies,
} from "@/lib/github/review-trigger";

const baseEvent = {
  action: "opened",
  installation: { id: 42 },
  repository: { id: 100, full_name: "owner/repo" },
  pull_request: {
    number: 7,
    draft: false,
    title: "Add feature",
    body: null,
    head: { sha: "0123456789abcdef0123456789abcdef01234567" },
    user: { login: "author", type: "User" },
  },
};

function createDependencies(
  overrides: Partial<ReviewTriggerDependencies["queries"]> = {},
): ReviewTriggerDependencies {
  const queries = {
    getReviewTarget: vi.fn().mockResolvedValue({
      suspended: false,
      enabled: true,
      repoFullName: "owner/repo",
    }),
    createQueuedReview: vi.fn().mockResolvedValue({
      created: true,
      review: { id: "review-1" },
    }),
    markReviewSkipped: vi.fn().mockResolvedValue(null),
    countReviewsToday: vi.fn().mockResolvedValue(0),
    ...overrides,
  };

  return {
    queries,
    rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    qstash: { publishJSON: vi.fn().mockResolvedValue({ messageId: "message-1" }) },
    reviewWorkerUrl: "https://diffguard.example/api/jobs/review",
  };
}

describe("review trigger", () => {
  it("ignores actions outside the review trigger set", async () => {
    const dependencies = createDependencies();
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler({ ...baseEvent, action: "closed" }, "delivery-1")).resolves.toEqual({
      status: "ignored",
    });
    expect(dependencies.queries.getReviewTarget).not.toHaveBeenCalled();
  });

  it("does not create rows for suspended or disabled repositories", async () => {
    const dependencies = createDependencies({
      getReviewTarget: vi.fn().mockResolvedValue({
        suspended: true,
        enabled: true,
        repoFullName: "owner/repo",
      }),
    });
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler(baseEvent, "delivery-1")).resolves.toEqual({ status: "ignored" });
    expect(dependencies.queries.createQueuedReview).not.toHaveBeenCalled();
  });

  it.each([
    ["draft", { pull_request: { ...baseEvent.pull_request, draft: true } }, "draft"],
    ["bot author", { pull_request: { ...baseEvent.pull_request, user: { login: "bot", type: "Bot" } } }, "bot_author"],
    ["skip keyword", { pull_request: { ...baseEvent.pull_request, title: "[skip-review] Add feature" } }, "skip_keyword"],
  ])("records the %s skip reason before rate limiting", async (_label, changes, reason) => {
    const dependencies = createDependencies();
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler({ ...baseEvent, ...changes }, "delivery-1")).resolves.toEqual({
      status: "skipped",
      reason,
    });
    expect(dependencies.queries.markReviewSkipped).toHaveBeenCalledWith(
      42,
      "review-1",
      reason,
    );
    expect(dependencies.rateLimiter.limit).not.toHaveBeenCalled();
    expect(dependencies.qstash.publishJSON).not.toHaveBeenCalled();
  });

  it("marks rate-limited events as skipped", async () => {
    const dependencies = createDependencies();
    dependencies.rateLimiter.limit = vi.fn().mockResolvedValue({ success: false });
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler(baseEvent, "delivery-1")).resolves.toEqual({
      status: "skipped",
      reason: "rate_limited",
    });
    expect(dependencies.queries.countReviewsToday).not.toHaveBeenCalled();
  });

  it("marks events over the daily cap as skipped", async () => {
    const dependencies = createDependencies();
    dependencies.queries.countReviewsToday = vi.fn().mockResolvedValue(20);
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler(baseEvent, "delivery-1")).resolves.toEqual({
      status: "skipped",
      reason: "daily_cap",
    });
    expect(dependencies.qstash.publishJSON).not.toHaveBeenCalled();
  });

  it("queues a new review after passing all checks", async () => {
    const dependencies = createDependencies();
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler(baseEvent, "delivery-1")).resolves.toEqual({ status: "queued" });
    expect(dependencies.rateLimiter.limit).toHaveBeenCalledWith("installation:42");
    expect(dependencies.qstash.publishJSON).toHaveBeenCalledWith({
      url: "https://diffguard.example/api/jobs/review",
      delay: 75,
      body: {
        installationId: 42,
        repositoryId: 100,
        repoFullName: "owner/repo",
        prNumber: 7,
        headSha: baseEvent.pull_request.head.sha,
        deliveryId: "delivery-1",
      },
    });
  });

  it("exits without publishing when idempotency finds an existing review", async () => {
    const dependencies = createDependencies({
      createQueuedReview: vi.fn().mockResolvedValue({
        created: false,
        review: { id: "review-1" },
      }),
    });
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler(baseEvent, "delivery-1")).resolves.toEqual({ status: "duplicate" });
    expect(dependencies.qstash.publishJSON).not.toHaveBeenCalled();
  });
});
