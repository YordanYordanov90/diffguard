import type { LearningAuditAction, LearningStatus } from "@/lib/db/schema";

export type DashboardLearning = {
  id: string;
  installationId: number;
  installationAccountLogin: string;
  installationAccountType: string;
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

export type DashboardLearningRepositoryGroup = {
  repositoryId: number;
  repositoryFullName: string;
  learnings: DashboardLearning[];
};

export type DashboardLearningInstallationGroup = {
  installationId: number;
  accountLogin: string;
  accountType: string;
  repositories: DashboardLearningRepositoryGroup[];
};

/** Group the filtered inventory by accessible installation, then repository. */
export function groupDashboardLearnings(
  learnings: DashboardLearning[],
): DashboardLearningInstallationGroup[] {
  const byInstallation = new Map<
    number,
    DashboardLearningInstallationGroup & {
      repositoryMap: Map<number, DashboardLearningRepositoryGroup>;
    }
  >();

  for (const learning of learnings) {
    let installation = byInstallation.get(learning.installationId);
    if (!installation) {
      installation = {
        installationId: learning.installationId,
        accountLogin: learning.installationAccountLogin,
        accountType: learning.installationAccountType,
        repositories: [],
        repositoryMap: new Map(),
      };
      byInstallation.set(learning.installationId, installation);
    }

    let repository = installation.repositoryMap.get(learning.repositoryId);
    if (!repository) {
      repository = {
        repositoryId: learning.repositoryId,
        repositoryFullName: learning.repositoryFullName,
        learnings: [],
      };
      installation.repositoryMap.set(learning.repositoryId, repository);
      installation.repositories.push(repository);
    }
    repository.learnings.push(learning);
  }

  return [...byInstallation.values()]
    .map((installation) => ({
      installationId: installation.installationId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      repositories: installation.repositories.sort((a, b) =>
        a.repositoryFullName.localeCompare(b.repositoryFullName),
      ),
    }))
    .sort((a, b) => a.accountLogin.localeCompare(b.accountLogin));
}

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
