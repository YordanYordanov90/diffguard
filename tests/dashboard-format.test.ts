import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatSkipReason,
  githubPrUrl,
  githubRepoUrl,
  isRepositoryFullName,
  reviewsFilterHref,
  shortSha,
  toDashboardReview,
} from "@/lib/dashboard/format";
import type { ListReviewsRow } from "@/lib/dashboard/types";

function makeRow(
  overrides: Partial<ListReviewsRow["review"]> = {},
): ListReviewsRow {
  return {
    repositoryName: "acme/app",
    review: {
      id: "11111111-1111-1111-1111-111111111111",
      installationId: 1,
      repositoryId: 2,
      prNumber: 42,
      headSha: "abcdef0123456789abcdef0123456789abcdef01",
      status: "completed",
      skipReason: null,
      verdict: "comment",
      reviewMode: "full",
      comparedFromSha: null,
      reviewMarkdown: "## Review",
      commentId: 99,
      findingsCritical: 1,
      findingsHigh: 2,
      findingsMedium: 0,
      findingsLow: 1,
      findingsInfo: 0,
      candidateFindings: 0,
      rejectedFindings: 0,
      manualCheckCandidates: 0,
      adjudicationModel: null,
      adjudicationDurationMs: null,
      targetedEvidenceCandidates: 0,
      targetedEvidenceComplete: 0,
      targetedEvidenceIncomplete: 0,
      targetedEvidenceFetched: 0,
      targetedEvidenceRequests: 0,
      targetedEvidenceDurationMs: null,
      securityVerificationCandidates: 0,
      securityVerificationVerified: 0,
      securityVerificationDowngraded: 0,
      securityVerificationRejected: 0,
      securityVerificationManual: 0,
      securityVerificationModel: null,
      securityVerificationInputTokens: null,
      securityVerificationOutputTokens: null,
      securityVerificationDurationMs: null,
      linkedIssueAssessments: [],
      skippedFiles: [],
      model: "openai/gpt-5-mini",
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 12500,
      error: null,
      createdAt: new Date("2026-07-25T12:00:00.000Z"),
      updatedAt: new Date("2026-07-25T12:00:10.000Z"),
      ...overrides,
    },
  };
}

describe("dashboard format helpers", () => {
  it("maps list rows to serializable dashboard reviews", () => {
    const review = toDashboardReview(makeRow());
    expect(review.findingsCount).toBe(4);
    expect(review.createdAt).toBe("2026-07-25T12:00:00.000Z");
    expect(review.repositoryName).toBe("acme/app");
  });

  it("formats duration buckets", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(4500)).toBe("4.5s");
    expect(formatDuration(12500)).toBe("13s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });

  it("formats github urls, shas, and skip reasons", () => {
    expect(githubPrUrl("acme/app", 7)).toBe("https://github.com/acme/app/pull/7");
    expect(shortSha("abcdef0123456789")).toBe("abcdef0");
    expect(formatSkipReason("daily_cap")).toBe("daily cap");
  });

  it("only builds github.com repository links for safe owner/repo names", () => {
    expect(isRepositoryFullName("acme/app")).toBe(true);
    expect(isRepositoryFullName("acme/app/extra")).toBe(false);
    expect(isRepositoryFullName("https://evil.example/x")).toBe(false);
    expect(githubRepoUrl("acme/app")).toBe("https://github.com/acme/app");
    expect(githubRepoUrl("../etc/passwd")).toBeNull();
    expect(reviewsFilterHref("acme/app")).toBe(
      "/dashboard/reviews?repository=acme%2Fapp",
    );
  });
});
