import { getDashboardAccess } from "@/lib/auth/access";
import {
  listLatestReviewsByRepository,
  listRepositoriesByInstallations,
} from "@/lib/db/queries";

import { buildCoverageGroups } from "./coverage";
import type { InstallationCoverageGroup } from "./types";

export type DashboardRepositoriesResult =
  | { status: "github-authorization-required" }
  | {
      status: "ready";
      groups: InstallationCoverageGroup[];
      repositoryCount: number;
    }
  | { status: "error" };

/**
 * Tenant-scoped repository inventory. Installation scope comes only from
 * Feature 16 GitHub access resolution — never from client input.
 */
export async function getDashboardRepositories(options?: {
  bypassCache?: boolean;
}): Promise<DashboardRepositoriesResult> {
  const access = await getDashboardAccess({
    bypassCache: options?.bypassCache,
  });
  if (access.status === "github-authorization-required") return access;

  try {
    const { installations, installationIds } = access;
    const [repositories, latestReviews] = await Promise.all([
      listRepositoriesByInstallations(installationIds),
      listLatestReviewsByRepository(installationIds),
    ]);

    const groups = buildCoverageGroups(
      installations,
      repositories,
      latestReviews,
    );

    return {
      status: "ready",
      groups,
      repositoryCount: groups.reduce(
        (sum, group) => sum + group.repositoryCount,
        0,
      ),
    };
  } catch {
    return { status: "error" };
  }
}
