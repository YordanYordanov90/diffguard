import type { reviews } from "@/lib/db/schema";

export type ReviewStatus = (typeof reviews.$inferSelect)["status"];
export type SkipReason = NonNullable<(typeof reviews.$inferSelect)["skipReason"]>;

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
