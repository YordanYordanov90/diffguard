import { getDashboardAccess } from "@/lib/auth/access";
import {
  listRepositoryLearningsByInstallations,
  type DashboardLearningRow,
} from "@/lib/db/queries";

import type { DashboardLearning } from "./learnings";

export type DashboardLearningsResult =
  | { status: "github-authorization-required" }
  | {
      status: "ready";
      learnings: DashboardLearning[];
      repositories: string[];
    }
  | { status: "error" };

function toDashboardLearning(row: DashboardLearningRow): DashboardLearning {
  return {
    id: row.id,
    installationId: row.installationId,
    repositoryId: row.repositoryId,
    repositoryFullName: row.repositoryFullName,
    guidance: row.guidance,
    status: row.status,
    createdBy: row.createdBy,
    sourceFindingId: row.sourceFindingId,
    sourceCommentId: row.sourceCommentId,
    sourcePrNumber: row.sourcePrNumber,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    lastModifiedBy: row.lastModifiedBy,
    lastModifiedAt: row.lastModifiedAt?.toISOString() ?? null,
    lastAction: row.lastAction,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Load repository learnings for the signed-in user's GitHub-derived
 * installation allowlist. Never accepts tenant scope from the client.
 */
export async function getDashboardLearnings(): Promise<DashboardLearningsResult> {
  const access = await getDashboardAccess();
  if (access.status === "github-authorization-required") return access;

  try {
    const rows = await listRepositoryLearningsByInstallations(
      access.installationIds,
    );
    const learnings = rows.map(toDashboardLearning);
    const repositories = [
      ...new Set(learnings.map((learning) => learning.repositoryFullName)),
    ].sort((a, b) => a.localeCompare(b));

    return { status: "ready", learnings, repositories };
  } catch {
    return { status: "error" };
  }
}
