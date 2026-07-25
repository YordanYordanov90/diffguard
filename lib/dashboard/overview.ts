import { getDashboardAccess } from "@/lib/auth/access";
import {
  countReviewsTodayForInstallations,
  listLatestReviewsByRepository,
  listRepositoriesByInstallations,
  listReviews,
} from "@/lib/db/queries";

import { buildOverviewModel } from "./coverage";
import { toDashboardReview } from "./format";
import type { OverviewModel } from "./types";

const RECENT_REVIEWS_LIMIT = 5;

export type DashboardOverviewResult =
  | { status: "github-authorization-required" }
  | { status: "ready"; data: OverviewModel }
  | { status: "error" };

/**
 * Tenant-scoped overview read model. Installation scope comes only from
 * Feature 16 GitHub access resolution — never from client input.
 */
export async function getDashboardOverview(): Promise<DashboardOverviewResult> {
  const access = await getDashboardAccess();
  if (access.status === "github-authorization-required") return access;

  try {
    const { installations, installationIds } = access;
    const [repositories, latestReviews, reviewsToday, recentRows] =
      await Promise.all([
        listRepositoriesByInstallations(installationIds),
        listLatestReviewsByRepository(installationIds),
        countReviewsTodayForInstallations(installationIds),
        listReviews(installationIds, RECENT_REVIEWS_LIMIT),
      ]);

    return {
      status: "ready",
      data: buildOverviewModel({
        installations,
        repositories,
        latestReviews,
        reviewsToday,
        recentReviews: recentRows.map(toDashboardReview),
      }),
    };
  } catch {
    return { status: "error" };
  }
}
