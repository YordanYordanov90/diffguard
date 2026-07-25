import { getDashboardAccess } from "@/lib/auth/access";
import { listReviews } from "@/lib/db/queries";

import { toDashboardReview } from "./format";
import type { DashboardReview } from "./types";

const DEFAULT_LIMIT = 50;

export type DashboardReviewsResult =
  | { status: "github-authorization-required" }
  | { status: "ready"; installationIds: number[]; reviews: DashboardReview[] };

/**
 * Tenant-scoped dashboard read. Installation IDs come only from the
 * Feature 16 guard (GitHub-derived), never from client input.
 */
export async function getDashboardReviews(
  limit: number = DEFAULT_LIMIT,
): Promise<DashboardReviewsResult> {
  const access = await getDashboardAccess();
  if (access.status === "github-authorization-required") return access;

  const rows = await listReviews(access.installationIds, limit);
  return {
    status: "ready",
    installationIds: access.installationIds,
    reviews: rows.map(toDashboardReview),
  };
}
