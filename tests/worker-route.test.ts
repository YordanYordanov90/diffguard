import { describe, expect, it, vi } from "vitest";

import {
  handleReviewWorker,
  type ReviewWorkerDependencies,
} from "@/app/api/jobs/review/route";

const headSha = "0123456789abcdef0123456789abcdef01234567";
const job = {
  installationId: 42,
  repositoryId: 100,
  repoFullName: "owner/repo",
  prNumber: 7,
  headSha,
  deliveryId: "delivery-1",
};

function createDependencies(
  overrides: Partial<ReviewWorkerDependencies["queries"]> = {},
  githubOverrides: Partial<ReviewWorkerDependencies["github"]> = {},
): ReviewWorkerDependencies {
  return {
    qstash: { verify: vi.fn().mockResolvedValue(true) },
    queries: {
      getReviewBySha: vi.fn().mockResolvedValue({
        id: "review-1",
        status: "queued",
        commentId: null,
      }),
      getInstallationModel: vi.fn().mockResolvedValue("openai/test"),
      countReviewsToday: vi.fn().mockResolvedValue(0),
      markReviewSkipped: vi.fn().mockResolvedValue(null),
      markReviewRunning: vi.fn().mockResolvedValue({ id: "review-1" }),
      markReviewCompleted: vi.fn().mockResolvedValue({ id: "review-1" }),
      markReviewFailed: vi.fn().mockResolvedValue({ id: "review-1" }),
      ...overrides,
    },
    github: {
      fetchPrHeadSha: vi.fn().mockResolvedValue(headSha),
      fetchPrDiff: vi.fn().mockResolvedValue(""),
      fetchInstructionsFile: vi.fn().mockResolvedValue(null),
      upsertComment: vi.fn().mockResolvedValue(9001),
      ...githubOverrides,
    },
    generateReview: vi.fn().mockResolvedValue({
      output: { summary: "Good.", verdict: "approve", findings: [] },
      usage: { inputTokens: 10, outputTokens: 3 },
      durationMs: 12,
    }),
  };
}

function request(payload: unknown = job) {
  return new Request("https://diffguard.example/api/jobs/review", {
    method: "POST",
    headers: { "upstash-signature": "signature" },
    body: JSON.stringify(payload),
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<{ success: boolean; data: unknown; error: string | null }>;
}

describe("review worker route", () => {
  it("rejects invalid signatures before parsing", async () => {
    const dependencies = createDependencies();
    dependencies.qstash.verify = vi.fn().mockResolvedValue(false);

    const response = await handleReviewWorker(request("not-json"), dependencies);

    expect(response.status).toBe(401);
    expect(dependencies.queries.getReviewBySha).not.toHaveBeenCalled();
  });

  it("rejects malformed signed jobs", async () => {
    const dependencies = createDependencies();
    const response = await handleReviewWorker(request({ ...job, headSha: "bad" }), dependencies);

    expect(response.status).toBe(400);
    expect(dependencies.queries.getReviewBySha).not.toHaveBeenCalled();
  });

  it("exits for completed reviews", async () => {
    const dependencies = createDependencies({
      getReviewBySha: vi.fn().mockResolvedValue({ id: "review-1", status: "completed" }),
    });
    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.fetchPrHeadSha).not.toHaveBeenCalled();
    expect(dependencies.queries.markReviewRunning).not.toHaveBeenCalled();
  });

  it.each([
    ["stale_sha", { fetchPrHeadSha: vi.fn().mockResolvedValue("abcdefabcdefabcdefabcdefabcdefabcdefabcd") }],
    ["daily_cap", {}],
  ])("takes the %s early exit", async (reason, githubOverrides) => {
    const dependencies = createDependencies(
      reason === "daily_cap" ? { countReviewsToday: vi.fn().mockResolvedValue(20) } : {},
      githubOverrides,
    );
    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.queries.markReviewSkipped).toHaveBeenCalledWith(42, "review-1", reason);
    expect(dependencies.queries.markReviewRunning).not.toHaveBeenCalled();
  });

  it("runs the pipeline in order and persists the rendered comment", async () => {
    const dependencies = createDependencies();
    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({
        commentId: 9001,
        reviewMarkdown: expect.stringContaining("DiffGuard Review"),
        verdict: "approve",
        findingsCritical: 0,
        skippedFiles: [],
      }),
    );
    expect(dependencies.queries.markReviewRunning).toHaveBeenCalledBefore(
      dependencies.github.fetchPrDiff,
    );
    expect(dependencies.github.upsertComment).toHaveBeenCalledBefore(
      dependencies.queries.markReviewCompleted,
    );
  });

  it("marks failures and returns a retryable response without posting", async () => {
    const dependencies = createDependencies({}, {
      fetchPrDiff: vi.fn().mockRejectedValue(new Error("GitHub unavailable")),
    });
    const response = await handleReviewWorker(request(), dependencies);
    const body = await responseBody(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe("Review processing failed.");
    expect(dependencies.queries.markReviewFailed).toHaveBeenCalledWith(
      42,
      "review-1",
      "Review processing failed.",
    );
    expect(dependencies.github.upsertComment).not.toHaveBeenCalled();
  });
});
