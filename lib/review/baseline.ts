/**
 * Pure baseline planning for incremental vs full review modes.
 * I/O (DB lookups, GitHub compare) stays in the worker; this module only
 * decides which mode is safe given already-validated comparison metadata.
 */

export const REVIEW_MODES = ["full", "incremental", "fallback_full"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

export type CommitComparisonStatus =
  | "ahead"
  | "behind"
  | "diverged"
  | "identical";

/**
 * Server-resolved comparison facts. Never accept previous SHAs or ancestry
 * claims from the webhook or client — only from DB + GitHub.
 */
export type CommitComparison = {
  status: CommitComparisonStatus;
  aheadBy: number;
  behindBy: number;
  /** True when GitHub truncated commits or files in the comparison. */
  truncated: boolean;
  /** True when the previous SHA could not be resolved (404 / deleted). */
  baseUnavailable: boolean;
  /** True when GitHub confirms the previous SHA is on this PR's history. */
  commitInPullRequest: boolean;
};

export type BaselineInput = {
  /** Internal override for Feature 34 full-review commands. Not user-facing. */
  forceFullReview: boolean;
  /** Latest completed review head for the same tenant/repo/PR, or null. */
  previousHeadSha: string | null;
  currentHeadSha: string;
  /**
   * Comparison against the previous head. Null when there is no previous
   * review or a forced full review short-circuits the compare.
   */
  comparison: CommitComparison | null;
};

export type BaselinePlan = {
  mode: ReviewMode;
  /** Prior completed head used as the compare base; null for pure full. */
  comparedFromSha: string | null;
  /** When true, fetch and review only the previous…head range. */
  useIncrementalDiff: boolean;
};

function isPureDescendant(comparison: CommitComparison): boolean {
  if (comparison.baseUnavailable || !comparison.commitInPullRequest) {
    return false;
  }
  if (comparison.truncated) return false;
  if (comparison.behindBy > 0) return false;
  return comparison.status === "ahead" || comparison.status === "identical";
}

/**
 * Decide review mode from trusted server state only.
 * Any comparison failure broadens to `fallback_full` rather than a partial range.
 */
export function planReviewBaseline(input: BaselineInput): BaselinePlan {
  if (input.forceFullReview) {
    return {
      mode: "full",
      comparedFromSha: null,
      useIncrementalDiff: false,
    };
  }

  if (!input.previousHeadSha) {
    return {
      mode: "full",
      comparedFromSha: null,
      useIncrementalDiff: false,
    };
  }

  const previous = input.previousHeadSha.toLowerCase();
  const current = input.currentHeadSha.toLowerCase();

  // Same head is handled by idempotency; treat as non-incremental if reached.
  if (previous === current) {
    return {
      mode: "full",
      comparedFromSha: null,
      useIncrementalDiff: false,
    };
  }

  if (!input.comparison || !isPureDescendant(input.comparison)) {
    return {
      mode: "fallback_full",
      comparedFromSha: input.previousHeadSha,
      useIncrementalDiff: false,
    };
  }

  return {
    mode: "incremental",
    comparedFromSha: input.previousHeadSha,
    useIncrementalDiff: true,
  };
}
