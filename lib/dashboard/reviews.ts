import { getDashboardAccess } from "@/lib/auth/access";
import { findAuthorizedRepository, listReviews } from "@/lib/db/queries";

import { isRepositoryFullName, toDashboardReview } from "./format";
import type { DashboardReview } from "./types";

const DEFAULT_LIMIT = 50;

export type DashboardReviewsResult =
  | { status: "github-authorization-required" }
  | {
      status: "ready";
      installationIds: number[];
      reviews: DashboardReview[];
      /** Applied only after allowlist confirmation; never echoes unauthorized names. */
      repositoryFilter: string | null;
    }
  | { status: "error" };

export type GetDashboardReviewsOptions = {
  limit?: number;
  /** Client-supplied repository full_name; applied only after allowlist check. */
  repositoryFullName?: string | null;
};

/**
 * Tenant-scoped dashboard read. Installation IDs come only from the
 * Feature 16 guard (GitHub-derived), never from client input.
 * Optional repository filter is applied only after the repository is
 * confirmed to belong to the allowlist.
 */
export async function getDashboardReviews(
  options: GetDashboardReviewsOptions = {},
): Promise<DashboardReviewsResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const access = await getDashboardAccess();
  if (access.status === "github-authorization-required") return access;

  try {
    const requested =
      typeof options.repositoryFullName === "string"
        ? options.repositoryFullName.trim()
        : null;

    let repositoryId: number | undefined;
    let repositoryFilter: string | null = null;

    if (requested && isRepositoryFullName(requested)) {
      const authorized = await findAuthorizedRepository(
        access.installationIds,
        requested,
      );
      if (authorized) {
        repositoryId = authorized.id;
        repositoryFilter = authorized.fullName;
      }
      // Unauthorized or unknown names are ignored — scope never expands.
    }

    const rows = await listReviews(access.installationIds, limit, {
      repositoryId,
    });

    return {
      status: "ready",
      installationIds: access.installationIds,
      reviews: rows.map(toDashboardReview),
      repositoryFilter,
    };
  } catch {
    return { status: "error" };
  }
}
