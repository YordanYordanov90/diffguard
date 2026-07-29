import { describe, expect, it } from "vitest";

import {
  planReviewBaseline,
  type CommitComparison,
} from "@/lib/review/baseline";

const previous = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const current = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function descendant(overrides: Partial<CommitComparison> = {}): CommitComparison {
  return {
    status: "ahead",
    aheadBy: 2,
    behindBy: 0,
    truncated: false,
    baseUnavailable: false,
    commitInPullRequest: true,
    ...overrides,
  };
}

describe("planReviewBaseline", () => {
  it("uses full mode for the first review with no completed baseline", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: null,
        currentHeadSha: current,
        comparison: null,
      }),
    ).toEqual({
      mode: "full",
      comparedFromSha: null,
      useIncrementalDiff: false,
    });
  });

  it("uses full mode when the internal full-review override is set", () => {
    expect(
      planReviewBaseline({
        forceFullReview: true,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant(),
      }),
    ).toEqual({
      mode: "full",
      comparedFromSha: null,
      useIncrementalDiff: false,
    });
  });

  it("uses incremental mode for a pure descendant update on the PR", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant({ aheadBy: 3 }),
      }),
    ).toEqual({
      mode: "incremental",
      comparedFromSha: previous,
      useIncrementalDiff: true,
    });
  });

  it("allows identical status with zero behind as incremental", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant({ status: "identical", aheadBy: 0 }),
      }),
    ).toMatchObject({ mode: "incremental", useIncrementalDiff: true });
  });

  it("falls back when history was rewritten (diverged)", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant({ status: "diverged", behindBy: 1, aheadBy: 2 }),
      }),
    ).toEqual({
      mode: "fallback_full",
      comparedFromSha: previous,
      useIncrementalDiff: false,
    });
  });

  it("falls back when the previous SHA is unrelated (behind)", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant({ status: "behind", behindBy: 4, aheadBy: 0 }),
      }),
    ).toMatchObject({ mode: "fallback_full", useIncrementalDiff: false });
  });

  it("falls back when the base commit is unavailable", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant({ baseUnavailable: true }),
      }),
    ).toMatchObject({ mode: "fallback_full", useIncrementalDiff: false });
  });

  it("falls back when the previous commit is not on the PR", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant({ commitInPullRequest: false }),
      }),
    ).toMatchObject({ mode: "fallback_full", useIncrementalDiff: false });
  });

  it("falls back when GitHub truncates the comparison", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: descendant({ truncated: true }),
      }),
    ).toMatchObject({ mode: "fallback_full", useIncrementalDiff: false });
  });

  it("falls back when comparison metadata is missing", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: previous,
        currentHeadSha: current,
        comparison: null,
      }),
    ).toMatchObject({ mode: "fallback_full", useIncrementalDiff: false });
  });

  it("uses full mode when previous and current heads match", () => {
    expect(
      planReviewBaseline({
        forceFullReview: false,
        previousHeadSha: current,
        currentHeadSha: current,
        comparison: descendant({ status: "identical" }),
      }),
    ).toEqual({
      mode: "full",
      comparedFromSha: null,
      useIncrementalDiff: false,
    });
  });
});
