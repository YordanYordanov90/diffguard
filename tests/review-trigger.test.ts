import { describe, expect, it, vi } from "vitest";

import {
  createReviewTriggerHandler,
  getReviewWorkerUrl,
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
    requeueReview: vi.fn().mockResolvedValue({ id: "review-1" }),
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
  it("uses the stable production URL for QStash worker deliveries", () => {
    expect(getReviewWorkerUrl({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "diffguard-one.vercel.app",
      VERCEL_URL: "diffguard-fxisad7pg-yordan-yordanovs-projects.vercel.app",
    })).toBe("https://diffguard-one.vercel.app/api/jobs/review");
  });

  it("keeps preview deliveries on the preview deployment", () => {
    expect(getReviewWorkerUrl({
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "diffguard-one.vercel.app",
      VERCEL_URL: "diffguard-preview.vercel.app",
    })).toBe(
      "https://diffguard-preview.vercel.app/api/jobs/review",
    );
  });

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
        prTitle: "Add feature",
        prBody: null,
        headSha: baseEvent.pull_request.head.sha,
        deliveryId: "delivery-1",
      },
    });
  });

  it("requeues a draft review when the PR becomes ready", async () => {
    const dependencies = createDependencies({
      createQueuedReview: vi
        .fn()
        .mockResolvedValueOnce({ created: true, review: { id: "review-1" } })
        .mockResolvedValueOnce({
          created: false,
          review: { id: "review-1", status: "skipped", skipReason: "draft" },
        }),
    });
    const handler = createReviewTriggerHandler(dependencies);

    await expect(
      handler({ ...baseEvent, pull_request: { ...baseEvent.pull_request, draft: true } }, "delivery-1"),
    ).resolves.toEqual({ status: "skipped", reason: "draft" });
    await expect(
      handler({ ...baseEvent, action: "ready_for_review" }, "delivery-2"),
    ).resolves.toEqual({ status: "queued" });

    expect(dependencies.queries.requeueReview).toHaveBeenCalledWith(42, "review-1");
    expect(dependencies.qstash.publishJSON).toHaveBeenCalledTimes(1);
  });

  it("republishes an existing queued review after a publish failure", async () => {
    const publishJSON = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary QStash failure"))
      .mockResolvedValueOnce({ messageId: "message-2" });
    const dependencies = createDependencies({
      createQueuedReview: vi
        .fn()
        .mockResolvedValueOnce({ created: true, review: { id: "review-1" } })
        .mockResolvedValueOnce({
          created: false,
          review: { id: "review-1", status: "queued", skipReason: null },
        }),
    });
    dependencies.qstash = { publishJSON };
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler(baseEvent, "delivery-1")).rejects.toThrow("temporary QStash failure");
    await expect(handler(baseEvent, "delivery-2")).resolves.toEqual({ status: "queued" });
    expect(publishJSON).toHaveBeenCalledTimes(2);
  });

  it("allows the review at the daily-cap boundary", async () => {
    const dependencies = createDependencies({
      countReviewsToday: vi.fn().mockResolvedValue(19),
    });
    const handler = createReviewTriggerHandler(dependencies);

    await expect(handler(baseEvent, "delivery-1")).resolves.toEqual({ status: "queued" });
    expect(dependencies.queries.countReviewsToday).toHaveBeenCalledBefore(
      dependencies.queries.createQueuedReview,
    );
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
