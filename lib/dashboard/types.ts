import type { AccessibleInstallation } from "@/lib/github/accessible-installation";
import type { reviews } from "@/lib/db/schema";

export type ReviewStatus = (typeof reviews.$inferSelect)["status"];
export type SkipReason = NonNullable<(typeof reviews.$inferSelect)["skipReason"]>;
export type ReviewVerdict = NonNullable<(typeof reviews.$inferSelect)["verdict"]>;

/** Serializable review row for the dashboard client (Feature 17). */
export type DashboardReview = {
  id: string;
  repositoryName: string;
  prNumber: number;
  headSha: string;
  status: ReviewStatus;
  skipReason: SkipReason | null;
  findingsCount: number;
  model: string | null;
  durationMs: number | null;
  reviewMarkdown: string | null;
  error: string | null;
  createdAt: string;
};

export type ListReviewsRow = {
  review: typeof reviews.$inferSelect;
  repositoryName: string;
};

/** Exact user-facing coverage labels from `ui-context.md`. */
export type CoverageLabel =
  | "Awaiting first review"
  | "Review failed"
  | "Needs attention"
  | "Reviewed"
  | "Queued"
  | "Running"
  | "Skipped";

export type InstallationStateLabel = "Active" | "Suspended";
export type RepositorySelectionLabel =
  | "All repositories"
  | "Selected repositories";

export type RepositoryCoverageRow = {
  repositoryId: number;
  fullName: string;
  label: CoverageLabel;
  detail: string | null;
  attention: boolean;
  latestReviewedAt: string | null;
};

export type InstallationCoverageGroup = {
  installationId: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: AccessibleInstallation["repository_selection"];
  repositorySelectionLabel: RepositorySelectionLabel;
  installationState: InstallationStateLabel;
  suspended: boolean;
  htmlUrl: string;
  repositoryCount: number;
  attentionCount: number;
  repositories: RepositoryCoverageRow[];
};

export type OverviewSummary = {
  installationCount: number;
  repositoryCount: number;
  reviewsToday: number;
  attentionCount: number;
};

export type OverviewModel = {
  summary: OverviewSummary;
  groups: InstallationCoverageGroup[];
  recentReviews: DashboardReview[];
};
