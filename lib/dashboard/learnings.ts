import type { LearningAuditAction, LearningStatus } from "@/lib/db/schema";

export type DashboardLearning = {
  id: string;
  installationId: number;
  repositoryId: number;
  repositoryFullName: string;
  guidance: string;
  status: LearningStatus;
  createdBy: string;
  sourceFindingId: string | null;
  sourceCommentId: number | null;
  sourcePrNumber: number | null;
  usageCount: number;
  lastUsedAt: string | null;
  archivedAt: string | null;
  lastModifiedBy: string | null;
  lastModifiedAt: string | null;
  lastAction: LearningAuditAction | null;
  createdAt: string;
  updatedAt: string;
};

/** Pure client-safe filter for the learnings inventory. */
export function filterDashboardLearnings(
  learnings: DashboardLearning[],
  options: {
    repository?: string;
    status?: LearningStatus | "all";
    query?: string;
  },
): DashboardLearning[] {
  const repository = options.repository?.trim() ?? "";
  const status = options.status ?? "all";
  const query = options.query?.trim().toLowerCase() ?? "";

  return learnings.filter((learning) => {
    if (repository && learning.repositoryFullName !== repository) return false;
    if (status !== "all" && learning.status !== status) return false;
    if (!query) return true;
    return (
      learning.guidance.toLowerCase().includes(query) ||
      learning.createdBy.toLowerCase().includes(query) ||
      learning.repositoryFullName.toLowerCase().includes(query)
    );
  });
}
