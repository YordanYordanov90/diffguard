import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatSkipReason,
  githubPrUrl,
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
      reviewMarkdown: "## Review",
      commentId: 99,
      findingsCritical: 1,
      findingsHigh: 2,
      findingsMedium: 0,
      findingsLow: 1,
      findingsInfo: 0,
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
});
