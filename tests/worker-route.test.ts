import { describe, expect, it, vi } from "vitest";

import {
  handleReviewWorker,
  type ReviewWorkerDependencies,
} from "@/lib/workers/review";
import { ReviewFailedError } from "@/lib/review/generate";

const headSha = "0123456789abcdef0123456789abcdef01234567";
const job = {
  installationId: 42,
  repositoryId: 100,
  repoFullName: "owner/repo",
  prNumber: 7,
  prTitle: "Add feature",
  prBody: "Please preserve the existing behavior.",
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
      getLatestReviewCommentId: vi.fn().mockResolvedValue(null),
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
      fetchRepositoryFile: vi.fn().mockResolvedValue({ status: "missing" }),
      fetchRepositoryTree: vi.fn().mockResolvedValue({ status: "fetched", paths: [] }),
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
      reason === "daily_cap" ? { countReviewsToday: vi.fn().mockResolvedValue(21) } : {},
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
    expect(dependencies.generateReview).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.stringContaining("Add feature") }),
      { model: "openai/test" },
    );
    expect(dependencies.github.upsertComment).toHaveBeenCalledBefore(
      dependencies.queries.markReviewCompleted,
    );
  });

  it("does not fetch file context when the base prompt has no remaining budget", async () => {
    const dependencies = createDependencies({}, {
      fetchPrDiff: vi.fn().mockResolvedValue(
        "diff --git a/src/auth.ts b/src/auth.ts\n@@ -1 +1 @@\n-old\n+new",
      ),
      fetchRepositoryFile: vi.fn(),
    });

    const response = await handleReviewWorker(
      request({ ...job, prBody: "x".repeat(300_000) }),
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(dependencies.github.fetchRepositoryFile).not.toHaveBeenCalled();
    expect(dependencies.generateReview).toHaveBeenCalled();
  });

  it("fetches one-hop related context at the exact head SHA", async () => {
    const dependencies = createDependencies({}, {
      fetchPrDiff: vi.fn().mockResolvedValue(
        `diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-import old\n+import "./security/check";`,
      ),
      fetchRepositoryTree: vi.fn().mockResolvedValue({
        status: "fetched",
        paths: ["src/app.ts", "src/security/check.ts"],
      }),
      fetchRepositoryFile: vi.fn().mockImplementation((_installation, _repo, path) =>
        path === "src/security/check.ts"
          ? Promise.resolve({
              status: "fetched",
              content: "export const check = true;",
              byteLength: 26,
            })
          : Promise.resolve({ status: "missing" }),
      ),
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.fetchRepositoryTree).toHaveBeenCalledWith(
      42,
      "owner/repo",
      headSha,
      expect.any(AbortSignal),
    );
    expect(dependencies.github.fetchRepositoryFile).toHaveBeenCalledWith(
      42,
      "owner/repo",
      "src/security/check.ts",
      headSha,
      expect.any(Number),
      expect.any(AbortSignal),
    );
    expect(dependencies.generateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.stringContaining("<untrusted-related_code_context>"),
      }),
      { model: "openai/test" },
    );
  });

  it("does not exceed the shared context request cap", async () => {
    const rawDiff = Array.from(
      { length: 8 },
      (_, index) =>
        `diff --git a/src/file${index}.ts b/src/file${index}.ts\n@@ -1 +1 @@\n-old\n+import "./related";`,
    ).join("\n");
    const dependencies = createDependencies({}, {
      fetchPrDiff: vi.fn().mockResolvedValue(rawDiff),
      fetchRepositoryTree: vi.fn().mockResolvedValue({
        status: "fetched",
        paths: [
          ...Array.from({ length: 8 }, (_, index) => `src/file${index}.ts`),
          "src/related.ts",
        ],
      }),
      fetchRepositoryFile: vi.fn().mockResolvedValue({
        status: "fetched",
        content: 'import "./related";',
        byteLength: 20,
      }),
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.fetchRepositoryFile).toHaveBeenCalledTimes(8);
    expect(dependencies.github.fetchRepositoryFile).not.toHaveBeenCalledWith(
      42,
      "owner/repo",
      "src/related.ts",
      expect.any(String),
      expect.any(Number),
      expect.any(AbortSignal),
    );
  });

  it("reuses the latest completed review comment for a new head SHA", async () => {
    const dependencies = createDependencies({
      getLatestReviewCommentId: vi.fn().mockResolvedValue(812),
    });

    await handleReviewWorker(request(), dependencies);

    expect(dependencies.github.upsertComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      812,
      expect.any(String),
    );
  });

  it("acknowledges terminal LLM validation failure without QStash retry", async () => {
    const dependencies = createDependencies();
    dependencies.generateReview = vi.fn().mockRejectedValue(
      new ReviewFailedError("The review could not be generated.", undefined, false),
    );

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.queries.markReviewFailed).toHaveBeenCalled();
    expect(dependencies.github.upsertComment).not.toHaveBeenCalled();
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
