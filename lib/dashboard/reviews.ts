import { requireDashboardInstallations } from "@/lib/auth/access";
import { listReviews } from "@/lib/db/queries";

import { toDashboardReview } from "./format";
import type { DashboardReview } from "./types";

const DEFAULT_LIMIT = 50;

/**
 * Tenant-scoped dashboard read. Installation IDs come only from the
 * Feature 16 guard (GitHub-derived), never from client input.
 */
export async function getDashboardReviews(
  limit: number = DEFAULT_LIMIT,
): Promise<DashboardReview[]> {
  const installationIds = await requireDashboardInstallations();
  const rows = await listReviews(installationIds, limit);
  return rows.map(toDashboardReview);
}
