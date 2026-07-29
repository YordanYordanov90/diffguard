import { describe, expect, it, vi } from "vitest";

import {
  handleReviewWorker,
  type ReviewWorkerDependencies,
} from "@/lib/workers/review";
import { ReviewFailedError } from "@/lib/review/generate";
import { renderInlineCommentBody } from "@/lib/review/inline";

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

const previousHeadSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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
      getLatestCompletedReviewForPr: vi.fn().mockResolvedValue(null),
      countReviewsToday: vi.fn().mockResolvedValue(0),
      markReviewSkipped: vi.fn().mockResolvedValue(null),
      markReviewRunning: vi.fn().mockResolvedValue({ id: "review-1" }),
      markReviewCompleted: vi.fn().mockResolvedValue({ id: "review-1" }),
      saveReviewCommentId: vi.fn().mockResolvedValue({ id: "review-1" }),
      markReviewFailed: vi.fn().mockResolvedValue({ id: "review-1" }),
      upsertConfirmedFindings: vi.fn().mockResolvedValue([]),
      attachFindingGitHubCommentId: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
    github: {
      fetchPrHeadSha: vi.fn().mockResolvedValue(headSha),
      fetchPrDiff: vi.fn().mockResolvedValue(""),
      fetchCommitComparison: vi.fn().mockResolvedValue({
        status: "compared",
        comparisonStatus: "ahead",
        aheadBy: 1,
        behindBy: 0,
        truncated: false,
      }),
      fetchCommitRangeDiff: vi.fn().mockResolvedValue(
        "diff --git a/src/new.ts b/src/new.ts\n@@ -0,0 +1 @@\n+export const n = 1;",
      ),
      isCommitOnPullRequest: vi.fn().mockResolvedValue(true),
      fetchInstructionsFile: vi.fn().mockResolvedValue(null),
      fetchRepositoryFile: vi.fn().mockResolvedValue({ status: "missing" }),
      fetchRepositoryTree: vi.fn().mockResolvedValue({ status: "fetched", paths: [] }),
      upsertComment: vi.fn().mockResolvedValue(9001),
      createPullRequestReview: vi.fn().mockResolvedValue({ reviewId: 1 }),
      listPullRequestReviewComments: vi.fn().mockResolvedValue([]),
      ...githubOverrides,
    },
    generateReview: vi.fn().mockResolvedValue({
      output: { summary: "Good.", verdict: "approve", findings: [] },
      usage: { inputTokens: 10, outputTokens: 3 },
      durationMs: 12,
    }),
    adjudicateReview: vi.fn().mockResolvedValue({
      output: { summary: "No confirmed findings.", verdict: "approve", decisions: [] },
      usage: { inputTokens: 6, outputTokens: 2 },
      durationMs: 4,
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

function storedInlineFinding() {
  return {
    id: "finding-1",
    fingerprint: "fp-1",
    githubCommentId: null,
    confidence: "high" as const,
    severity: "high" as const,
    category: "bug" as const,
    file: "src/row.tsx",
    line: 1,
    title: "Inline candidate",
    detail: "Detail",
    suggestion: null,
    suggestedChange: null,
  };
}

function inlineBody(title: string, detail: string, suggestion: string | null = null) {
  return renderInlineCommentBody({
    severity: "high",
    title,
    detail,
    suggestion,
    suggestedChange: null,
  });
}

function configureConfirmedInlineFinding(dependencies: ReviewWorkerDependencies) {
  dependencies.generateReview = vi.fn().mockResolvedValue({
    output: {
      summary: "Draft",
      verdict: "concerns",
      candidates: [{
        ...storedInlineFinding(),
        observedBehavior: "Observed",
        causalPath: "Path",
        violatedInvariant: "Invariant",
        requiresRuntimeVerification: false,
      }],
    },
    usage: { inputTokens: 1, outputTokens: 1 },
    durationMs: 1,
  });
  dependencies.adjudicateReview = vi.fn().mockResolvedValue({
    output: {
      summary: "Confirmed.",
      verdict: "concerns",
      decisions: [{
        candidateId: "candidate-1",
        decision: "confirmed",
        reason: "ok",
      }],
    },
    usage: { inputTokens: 1, outputTokens: 1 },
    durationMs: 1,
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
        reviewMode: "full",
        comparedFromSha: null,
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
      expect.objectContaining({ deadline: expect.any(Number) }),
    );
    expect(dependencies.adjudicateReview).not.toHaveBeenCalled();
    expect(dependencies.github.upsertComment).toHaveBeenCalledBefore(
      dependencies.queries.saveReviewCommentId,
    );
    expect(dependencies.queries.saveReviewCommentId).toHaveBeenCalledWith(
      42,
      "review-1",
      9001,
    );
    expect(dependencies.queries.saveReviewCommentId).toHaveBeenCalledBefore(
      dependencies.queries.markReviewCompleted,
    );
  });

  it("reviews only the commit range for a normal descendant push", async () => {
    const rangeDiff =
      "diff --git a/src/only-new.ts b/src/only-new.ts\n@@ -0,0 +1 @@\n+export const only = true;";
    const dependencies = createDependencies(
      {
        getLatestCompletedReviewForPr: vi.fn().mockResolvedValue({
          id: "review-0",
          headSha: previousHeadSha,
          commentId: 100,
          updatedAt: new Date("2026-01-01"),
        }),
      },
      {
        fetchCommitRangeDiff: vi.fn().mockResolvedValue(rangeDiff),
        fetchPrDiff: vi.fn().mockResolvedValue(
          "diff --git a/src/old.ts b/src/old.ts\n@@ -1 +1 @@\n-old\n+changed",
        ),
      },
    );

    const response = await handleReviewWorker(request(), dependencies);
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      status: "completed",
      reviewMode: "incremental",
      comparedFromSha: previousHeadSha,
    });
    expect(dependencies.github.fetchCommitComparison).toHaveBeenCalledWith(
      42,
      "owner/repo",
      previousHeadSha,
      headSha,
    );
    expect(dependencies.github.fetchCommitRangeDiff).toHaveBeenCalledWith(
      42,
      "owner/repo",
      previousHeadSha,
      headSha,
    );
    expect(dependencies.github.fetchPrDiff).not.toHaveBeenCalled();
    const prompt = vi.mocked(dependencies.generateReview).mock.calls[0]?.[0];
    expect(prompt?.user).toContain("src/only-new.ts");
    expect(prompt?.user).not.toContain("src/old.ts");
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({
        reviewMode: "incremental",
        comparedFromSha: previousHeadSha,
        reviewMarkdown: expect.stringContaining("incremental"),
      }),
    );
  });

  it("falls back to a disclosed full review on force-push / rewritten history", async () => {
    const fullDiff =
      "diff --git a/src/rewritten.ts b/src/rewritten.ts\n@@ -0,0 +1 @@\n+export const rewritten = true;";
    const dependencies = createDependencies(
      {
        getLatestCompletedReviewForPr: vi.fn().mockResolvedValue({
          id: "review-0",
          headSha: previousHeadSha,
          commentId: 100,
          updatedAt: new Date("2026-01-01"),
        }),
      },
      {
        fetchCommitComparison: vi.fn().mockResolvedValue({
          status: "compared",
          comparisonStatus: "diverged",
          aheadBy: 5,
          behindBy: 3,
          truncated: false,
        }),
        fetchPrDiff: vi.fn().mockResolvedValue(fullDiff),
      },
    );

    const response = await handleReviewWorker(request(), dependencies);
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      status: "completed",
      reviewMode: "fallback_full",
      comparedFromSha: previousHeadSha,
    });
    expect(dependencies.github.fetchCommitRangeDiff).not.toHaveBeenCalled();
    expect(dependencies.github.fetchPrDiff).toHaveBeenCalledWith(42, "owner/repo", 7);
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({
        reviewMode: "fallback_full",
        comparedFromSha: previousHeadSha,
        reviewMarkdown: expect.stringContaining("full review (fallback)"),
      }),
    );
  });

  it("falls back when the previous commit was deleted", async () => {
    const dependencies = createDependencies(
      {
        getLatestCompletedReviewForPr: vi.fn().mockResolvedValue({
          id: "review-0",
          headSha: previousHeadSha,
          commentId: null,
          updatedAt: new Date("2026-01-01"),
        }),
      },
      {
        fetchCommitComparison: vi.fn().mockResolvedValue({ status: "unavailable" }),
        isCommitOnPullRequest: vi.fn().mockResolvedValue(false),
      },
    );

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.fetchPrDiff).toHaveBeenCalled();
    expect(dependencies.github.fetchCommitRangeDiff).not.toHaveBeenCalled();
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({ reviewMode: "fallback_full" }),
    );
  });

  it("falls back when GitHub truncates the comparison", async () => {
    const dependencies = createDependencies(
      {
        getLatestCompletedReviewForPr: vi.fn().mockResolvedValue({
          id: "review-0",
          headSha: previousHeadSha,
          commentId: null,
          updatedAt: new Date("2026-01-01"),
        }),
      },
      {
        fetchCommitComparison: vi.fn().mockResolvedValue({
          status: "compared",
          comparisonStatus: "ahead",
          aheadBy: 40,
          behindBy: 0,
          truncated: true,
        }),
      },
    );

    await handleReviewWorker(request(), dependencies);

    expect(dependencies.github.fetchPrDiff).toHaveBeenCalled();
    expect(dependencies.github.fetchCommitRangeDiff).not.toHaveBeenCalled();
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({ reviewMode: "fallback_full" }),
    );
  });

  it("honors the internal forceFullReview override", async () => {
    const dependencies = createDependencies({
      getLatestCompletedReviewForPr: vi.fn().mockResolvedValue({
        id: "review-0",
        headSha: previousHeadSha,
        commentId: null,
        updatedAt: new Date("2026-01-01"),
      }),
    });

    await handleReviewWorker(request({ ...job, forceFullReview: true }), dependencies);

    expect(dependencies.queries.getLatestCompletedReviewForPr).not.toHaveBeenCalled();
    expect(dependencies.github.fetchCommitComparison).not.toHaveBeenCalled();
    expect(dependencies.github.fetchPrDiff).toHaveBeenCalled();
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({ reviewMode: "full", comparedFromSha: null }),
    );
  });

  it("skips publication when the head becomes stale after generation", async () => {
    const dependencies = createDependencies();
    dependencies.github.fetchPrHeadSha = vi
      .fn()
      .mockResolvedValueOnce(headSha)
      .mockResolvedValueOnce("cccccccccccccccccccccccccccccccccccccccc");

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.queries.markReviewSkipped).toHaveBeenCalledWith(
      42,
      "review-1",
      "stale_sha",
    );
    expect(dependencies.github.upsertComment).not.toHaveBeenCalled();
    expect(dependencies.queries.markReviewCompleted).not.toHaveBeenCalled();
  });

  it("fails before summary when confirmed findings cannot be persisted", async () => {
    const dependencies = createDependencies({
      upsertConfirmedFindings: vi.fn().mockRejectedValue(new Error("Database unavailable.")),
    }, {
      fetchPrDiff: vi.fn().mockResolvedValue(
        `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
      ),
    });
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Draft",
        verdict: "concerns",
        candidates: [{
          severity: "high",
          category: "bug",
          file: "src/row.tsx",
          line: 1,
          title: "Confirmed changed behavior",
          detail: "The changed behavior breaks the invariant.",
          suggestion: null,
          confidence: "high",
          observedBehavior: "The new branch returns an unsafe value.",
          causalPath: "The changed return is consumed by the caller.",
          violatedInvariant: "The caller must receive a safe value.",
          requiresRuntimeVerification: false,
          suggestedChange: null,
        }],
      },
      usage: { inputTokens: 2, outputTokens: 1 },
      durationMs: 1,
    });
    dependencies.adjudicateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Confirmed",
        verdict: "concerns",
        decisions: [{
          candidateId: "candidate-1",
          decision: "confirmed",
          reason: "The hunk proves the failure path.",
        }],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(500);
    // Feature 26 persists findings before inline/summary so comment ids can attach.
    expect(dependencies.queries.upsertConfirmedFindings).toHaveBeenCalled();
    expect(dependencies.github.upsertComment).not.toHaveBeenCalled();
    expect(dependencies.queries.saveReviewCommentId).not.toHaveBeenCalled();
    expect(dependencies.queries.markReviewFailed).toHaveBeenCalledWith(
      42,
      "review-1",
      "Review processing failed.",
    );
    expect(dependencies.queries.markReviewCompleted).not.toHaveBeenCalled();
  });

  it("still posts the summary after inline comment attachment fails", async () => {
    const dependencies = createDependencies(
      {
        upsertConfirmedFindings: vi.fn().mockResolvedValue([
          {
            id: "finding-1",
            fingerprint: "fp-1",
            githubCommentId: null,
            confidence: "high",
            severity: "high",
            category: "bug",
            file: "src/row.tsx",
            line: 1,
            title: "Confirmed changed behavior",
            detail: "Detail",
            suggestion: null,
            suggestedChange: null,
          },
        ]),
        attachFindingGitHubCommentId: vi.fn().mockRejectedValue(
          new Error("Database unavailable."),
        ),
      },
      {
        fetchPrDiff: vi.fn().mockResolvedValue(
          `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
        ),
        createPullRequestReview: vi.fn().mockResolvedValue({
          reviewId: 55,
        }),
        listPullRequestReviewComments: vi.fn().mockResolvedValue([
          {
            id: 8801,
            path: "src/row.tsx",
            line: 1,
            startLine: null,
            body: inlineBody("Confirmed changed behavior", "Detail"),
          },
        ]),
      },
    );
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Draft",
        verdict: "concerns",
        candidates: [{
          severity: "high",
          category: "bug",
          file: "src/row.tsx",
          line: 1,
          title: "Confirmed changed behavior",
          detail: "Detail",
          suggestion: null,
          confidence: "high",
          observedBehavior: "Observed",
          causalPath: "Path",
          violatedInvariant: "Invariant",
          requiresRuntimeVerification: false,
          suggestedChange: null,
        }],
      },
      usage: { inputTokens: 2, outputTokens: 1 },
      durationMs: 1,
    });
    dependencies.adjudicateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Confirmed",
        verdict: "concerns",
        decisions: [{
          candidateId: "candidate-1",
          decision: "confirmed",
          reason: "ok",
        }],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.createPullRequestReview).toHaveBeenCalled();
    expect(dependencies.github.upsertComment).toHaveBeenCalled();
    expect(dependencies.queries.saveReviewCommentId).toHaveBeenCalledWith(
      42,
      "review-1",
      9001,
    );
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalled();
    expect(dependencies.queries.markReviewFailed).not.toHaveBeenCalled();
  });

  it("gates candidates before rendering and persists aggregate adjudication telemetry", async () => {
    const dependencies = createDependencies({}, {
      fetchPrDiff: vi.fn().mockResolvedValue(
        `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
      ),
    });
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Candidate draft must not be published.",
        verdict: "concerns",
        candidates: [{
          severity: "high",
          category: "bug",
          file: "src/row.tsx",
          line: 1,
          title: "Confirmed changed behavior",
          detail: "The changed behavior breaks the invariant.",
          suggestion: null,
          confidence: "high",
          observedBehavior: "The new branch returns an unsafe value.",
          causalPath: "The changed return is consumed by the caller.",
          violatedInvariant: "The caller must receive a safe value.",
          requiresRuntimeVerification: false,
          suggestedChange: null,
        }],
      },
      usage: { inputTokens: 10, outputTokens: 3 },
      durationMs: 12,
    });
    dependencies.adjudicateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "The changed behavior has a concrete failure path.",
        verdict: "concerns",
        decisions: [{
          candidateId: "candidate-1",
          decision: "confirmed",
          reason: "The hunk demonstrates the failure path.",
        }],
      },
      usage: { inputTokens: 8, outputTokens: 4 },
      durationMs: 5,
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.adjudicateReview).toHaveBeenCalledOnce();
    expect(dependencies.github.upsertComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      null,
      expect.stringContaining("Confirmed changed behavior"),
    );
    expect(dependencies.github.upsertComment).not.toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      null,
      expect.stringContaining("Candidate draft must not be published"),
    );
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({
        candidateFindings: 1,
        rejectedFindings: 0,
        manualCheckCandidates: 0,
        adjudicationModel: "openai/test",
        inputTokens: 18,
        outputTokens: 7,
      }),
    );
    expect(dependencies.queries.upsertConfirmedFindings).toHaveBeenCalledWith([
      expect.objectContaining({
        installationId: 42,
        repositoryId: 100,
        prNumber: 7,
        reviewId: "review-1",
        headSha,
        file: "src/row.tsx",
        line: 1,
        title: "Confirmed changed behavior",
        confidence: "high",
        observedBehavior: "The new branch returns an unsafe value.",
        causalPath: "The changed return is consumed by the caller.",
        violatedInvariant: "The caller must receive a safe value.",
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
  });

  it("posts a COMMENT review for confirmed high-confidence findings and attaches comment ids", async () => {
    const dependencies = createDependencies(
      {
        upsertConfirmedFindings: vi.fn().mockResolvedValue([
          {
            id: "finding-1",
            fingerprint: "fp-1",
            githubCommentId: null,
            confidence: "high",
            severity: "high",
            category: "security",
            file: "src/row.tsx",
            line: 1,
            title: "Confirmed changed behavior",
            detail: "The changed behavior breaks the invariant.",
            suggestion: "Use a safe value.",
            suggestedChange: null,
          },
        ]),
      },
      {
        fetchPrDiff: vi.fn().mockResolvedValue(
          `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
        ),
        createPullRequestReview: vi.fn().mockResolvedValue({
          reviewId: 55,
        }),
        listPullRequestReviewComments: vi.fn().mockResolvedValue([
          {
            id: 8801,
            path: "src/row.tsx",
            line: 1,
            startLine: null,
            body: inlineBody(
              "Confirmed changed behavior",
              "The changed behavior breaks the invariant.",
              "Use a safe value.",
            ),
          },
        ]),
      },
    );
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Draft",
        verdict: "concerns",
        candidates: [{
          severity: "high",
          category: "security",
          file: "src/row.tsx",
          line: 1,
          title: "Confirmed changed behavior",
          detail: "The changed behavior breaks the invariant.",
          suggestion: "Use a safe value.",
          confidence: "high",
          observedBehavior: "The new branch returns an unsafe value.",
          causalPath: "The changed return is consumed by the caller.",
          violatedInvariant: "The caller must receive a safe value.",
          requiresRuntimeVerification: false,
          suggestedChange: null,
        }],
      },
      usage: { inputTokens: 4, outputTokens: 2 },
      durationMs: 3,
    });
    dependencies.adjudicateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Confirmed.",
        verdict: "concerns",
        decisions: [{
          candidateId: "candidate-1",
          decision: "confirmed",
          reason: "Concrete path.",
        }],
      },
      usage: { inputTokens: 2, outputTokens: 1 },
      durationMs: 1,
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.createPullRequestReview).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      headSha,
      [
        expect.objectContaining({
          path: "src/row.tsx",
          line: 1,
          side: "RIGHT",
          body: expect.stringContaining("Confirmed changed behavior"),
        }),
      ],
    );
    expect(dependencies.queries.attachFindingGitHubCommentId).toHaveBeenCalledWith(
      42,
      "finding-1",
      8801,
    );
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({
        reviewMarkdown: expect.stringContaining("posted as inline comment"),
      }),
    );
  });

  it("keeps the summary successful when inline review publishing fails", async () => {
    const dependencies = createDependencies(
      {
        upsertConfirmedFindings: vi.fn().mockResolvedValue([
          {
            id: "finding-1",
            fingerprint: "fp-1",
            githubCommentId: null,
            confidence: "high",
            severity: "high",
            category: "bug",
            file: "src/row.tsx",
            line: 1,
            title: "Inline candidate",
            detail: "Detail",
            suggestion: null,
            suggestedChange: null,
          },
        ]),
      },
      {
        fetchPrDiff: vi.fn().mockResolvedValue(
          `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
        ),
        createPullRequestReview: vi.fn().mockRejectedValue(new Error("rate limited")),
      },
    );
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Draft",
        verdict: "concerns",
        candidates: [{
          severity: "high",
          category: "bug",
          file: "src/row.tsx",
          line: 1,
          title: "Inline candidate",
          detail: "Detail",
          suggestion: null,
          confidence: "high",
          observedBehavior: "Observed",
          causalPath: "Path",
          violatedInvariant: "Invariant",
          requiresRuntimeVerification: false,
          suggestedChange: null,
        }],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });
    dependencies.adjudicateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Confirmed.",
        verdict: "concerns",
        decisions: [{
          candidateId: "candidate-1",
          decision: "confirmed",
          reason: "ok",
        }],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.createPullRequestReview).toHaveBeenCalledTimes(2);
    expect(dependencies.queries.attachFindingGitHubCommentId).not.toHaveBeenCalled();
    expect(dependencies.github.upsertComment).toHaveBeenCalled();
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalled();
  });

  it("skips all publication when the head changes during review", async () => {
    const staleHeadSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const dependencies = createDependencies(
      { upsertConfirmedFindings: vi.fn().mockResolvedValue([storedInlineFinding()]) },
      {
        fetchPrDiff: vi.fn().mockResolvedValue(
          `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
        ),
        fetchPrHeadSha: vi.fn()
          .mockResolvedValueOnce(headSha)
          .mockResolvedValueOnce(staleHeadSha),
      },
    );
    configureConfirmedInlineFinding(dependencies);

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.fetchPrHeadSha).toHaveBeenCalledTimes(2);
    expect(dependencies.github.createPullRequestReview).not.toHaveBeenCalled();
    expect(dependencies.github.upsertComment).not.toHaveBeenCalled();
    expect(dependencies.queries.markReviewSkipped).toHaveBeenCalledWith(
      42,
      "review-1",
      "stale_sha",
    );
  });

  it("retries comment lookup without reposting an accepted review", async () => {
    const dependencies = createDependencies(
      { upsertConfirmedFindings: vi.fn().mockResolvedValue([storedInlineFinding()]) },
      {
        fetchPrDiff: vi.fn().mockResolvedValue(
          `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
        ),
        createPullRequestReview: vi.fn().mockResolvedValue({ reviewId: 55 }),
        listPullRequestReviewComments: vi.fn()
          .mockRejectedValueOnce(new Error("GitHub comment lookup failed."))
          .mockResolvedValueOnce([
            {
              id: 8801,
              path: "src/row.tsx",
              line: 1,
              startLine: null,
              body: inlineBody("Inline candidate", "Detail"),
            },
          ]),
      },
    );
    configureConfirmedInlineFinding(dependencies);

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.createPullRequestReview).toHaveBeenCalledOnce();
    expect(dependencies.github.listPullRequestReviewComments).toHaveBeenCalledTimes(2);
    expect(dependencies.queries.attachFindingGitHubCommentId).toHaveBeenCalledWith(
      42,
      "finding-1",
      8801,
    );
    expect(dependencies.github.upsertComment).toHaveBeenCalled();
  });

  it("matches same-coordinate inline comments by their rendered body", async () => {
    const first = {
      ...storedInlineFinding(),
      id: "finding-first",
      fingerprint: "fp-first",
      title: "First inline candidate",
    };
    const second = {
      ...storedInlineFinding(),
      id: "finding-second",
      fingerprint: "fp-second",
      title: "Second inline candidate",
    };
    const dependencies = createDependencies(
      { upsertConfirmedFindings: vi.fn().mockResolvedValue([first, second]) },
      {
        fetchPrDiff: vi.fn().mockResolvedValue(
          "diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new",
        ),
        createPullRequestReview: vi.fn().mockResolvedValue({ reviewId: 55 }),
        listPullRequestReviewComments: vi.fn().mockResolvedValue([
          {
            id: 8802,
            path: "src/row.tsx",
            line: 1,
            startLine: null,
            body: inlineBody("Second inline candidate", "Detail"),
          },
          {
            id: 8801,
            path: "src/row.tsx",
            line: 1,
            startLine: null,
            body: inlineBody("First inline candidate", "Detail"),
          },
        ]),
      },
    );
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Draft",
        verdict: "concerns",
        candidates: [first, second].map((finding) => ({
          ...finding,
          observedBehavior: "Observed",
          causalPath: "Path",
          violatedInvariant: "Invariant",
          requiresRuntimeVerification: false,
        })),
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });
    dependencies.adjudicateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Confirmed.",
        verdict: "concerns",
        decisions: ["candidate-1", "candidate-2"].map((candidateId) => ({
          candidateId,
          decision: "confirmed" as const,
          reason: "ok",
        })),
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.queries.attachFindingGitHubCommentId).toHaveBeenCalledWith(
      42,
      "finding-first",
      8801,
    );
    expect(dependencies.queries.attachFindingGitHubCommentId).toHaveBeenCalledWith(
      42,
      "finding-second",
      8802,
    );
  });

  it("does not persist rejected or manual-verification candidates as finding rows", async () => {
    const dependencies = createDependencies({}, {
      fetchPrDiff: vi.fn().mockResolvedValue(
        `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
      ),
    });
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Draft",
        verdict: "concerns",
        candidates: [{
          severity: "high",
          category: "bug",
          file: "src/row.tsx",
          line: 1,
          title: "Needs human check",
          detail: "Detail",
          suggestion: null,
          confidence: "medium",
          observedBehavior: "Observed",
          causalPath: "Path",
          violatedInvariant: "Invariant",
          requiresRuntimeVerification: false,
          suggestedChange: null,
        }],
      },
      usage: { inputTokens: 2, outputTokens: 1 },
      durationMs: 1,
    });
    dependencies.adjudicateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Manual only",
        verdict: "approve",
        decisions: [{
          candidateId: "candidate-1",
          decision: "manual_verification",
          reason: "Needs browser check.",
        }],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.queries.upsertConfirmedFindings).not.toHaveBeenCalled();
  });

  it("fails closed when adjudication times out", async () => {
    const dependencies = createDependencies({}, {
      fetchPrDiff: vi.fn().mockResolvedValue(
        `diff --git a/src/row.tsx b/src/row.tsx\n@@ -1 +1 @@\n-old\n+new`,
      ),
    });
    dependencies.generateReview = vi.fn().mockResolvedValue({
      output: {
        summary: "Draft",
        verdict: "concerns",
        candidates: [{
          severity: "critical",
          category: "security",
          file: "src/row.tsx",
          line: 1,
          title: "Unverified candidate",
          detail: "Candidate detail.",
          suggestion: null,
          confidence: "high",
          observedBehavior: "Observed behavior.",
          causalPath: "Causal path.",
          violatedInvariant: "Invariant.",
          requiresRuntimeVerification: false,
          suggestedChange: null,
        }],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
      durationMs: 1,
    });
    dependencies.adjudicateReview = vi.fn().mockRejectedValue(
      new ReviewFailedError("The review generation timed out.", undefined, true, true),
    );

    const response = await handleReviewWorker(request(), dependencies);

    expect(response.status).toBe(200);
    expect(dependencies.github.upsertComment).toHaveBeenCalledWith(
      42,
      "owner/repo",
      7,
      null,
      expect.not.stringContaining("Unverified candidate"),
    );
    expect(dependencies.queries.markReviewCompleted).toHaveBeenCalledWith(
      42,
      "review-1",
      expect.objectContaining({
        findingsCritical: 0,
        candidateFindings: 1,
        rejectedFindings: 1,
        manualCheckCandidates: 0,
      }),
    );
    expect(dependencies.queries.upsertConfirmedFindings).not.toHaveBeenCalled();
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
      expect.objectContaining({ deadline: expect.any(Number) }),
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
