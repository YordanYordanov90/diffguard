import type { AccessibleInstallation } from "@/lib/github/accessible-installation";

import type {
  CoverageLabel,
  InstallationCoverageGroup,
  InstallationStateLabel,
  OverviewModel,
  OverviewSummary,
  RepositoryCoverageRow,
  RepositorySelectionLabel,
  ReviewStatus,
  ReviewVerdict,
} from "./types";

export type LatestReviewMetadata = {
  repositoryId: number;
  installationId: number;
  status: ReviewStatus;
  verdict: ReviewVerdict | null;
  updatedAt: Date;
  createdAt: Date;
};

export type RepositoryRecord = {
  id: number;
  installationId: number;
  fullName: string;
  enabled: boolean;
};

/** Map GitHub repository_selection to exact UI vocabulary. */
export function repositorySelectionLabel(
  selection: AccessibleInstallation["repository_selection"],
): RepositorySelectionLabel {
  return selection === "all" ? "All repositories" : "Selected repositories";
}

export function installationStateLabel(suspended: boolean): InstallationStateLabel {
  return suspended ? "Suspended" : "Active";
}

/**
 * Derive repository coverage from latest review metadata.
 * Attention: failed latest review, or completed with verdict `concerns`.
 * No reviews → Awaiting first review (neutral, not attention).
 */
export function deriveRepositoryCoverage(
  latest: LatestReviewMetadata | undefined,
  installationSuspended: boolean,
): Pick<RepositoryCoverageRow, "label" | "detail" | "attention" | "latestReviewedAt"> {
  if (installationSuspended) {
    return {
      label: latest ? coverageLabelFromReview(latest) : "Awaiting first review",
      detail: "Installation suspended",
      attention: true,
      latestReviewedAt: latest ? latest.updatedAt.toISOString() : null,
    };
  }

  if (!latest) {
    return {
      label: "Awaiting first review",
      detail: null,
      attention: false,
      latestReviewedAt: null,
    };
  }

  const label = coverageLabelFromReview(latest);
  const attention =
    latest.status === "failed" ||
    (latest.status === "completed" && latest.verdict === "concerns");

  return {
    label,
    detail: null,
    attention,
    latestReviewedAt: latest.updatedAt.toISOString(),
  };
}

function coverageLabelFromReview(latest: LatestReviewMetadata): CoverageLabel {
  if (latest.status === "failed") return "Review failed";
  if (latest.status === "completed") {
    return latest.verdict === "concerns" ? "Needs attention" : "Reviewed";
  }
  if (latest.status === "queued") return "Queued";
  if (latest.status === "running") return "Running";
  return "Skipped";
}

function sortRank(row: RepositoryCoverageRow): number {
  if (row.attention) return 0;
  if (row.label === "Awaiting first review") return 1;
  return 2;
}

export function sortCoverageRepositories(
  rows: RepositoryCoverageRow[],
): RepositoryCoverageRow[] {
  return [...rows].sort((a, b) => {
    const rank = sortRank(a) - sortRank(b);
    if (rank !== 0) return rank;
    return a.fullName.localeCompare(b.fullName);
  });
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const deltaMs = Math.max(0, now.getTime() - then.getTime());
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Presentation line for a coverage row (label + optional relative time). */
export function formatCoverageDetail(
  row: Pick<RepositoryCoverageRow, "label" | "detail" | "latestReviewedAt">,
  now = new Date(),
): string {
  if (row.detail) return row.detail;
  if (row.label === "Reviewed" && row.latestReviewedAt) {
    const relative = formatRelativeTime(row.latestReviewedAt, now);
    return relative ? `Reviewed ${relative}` : "Reviewed";
  }
  return row.label;
}

export function buildCoverageGroups(
  installations: AccessibleInstallation[],
  repositories: RepositoryRecord[],
  latestReviews: LatestReviewMetadata[],
): InstallationCoverageGroup[] {
  const latestByRepo = new Map(
    latestReviews.map((review) => [review.repositoryId, review] as const),
  );
  const reposByInstallation = new Map<number, RepositoryRecord[]>();
  for (const repository of repositories) {
    const list = reposByInstallation.get(repository.installationId) ?? [];
    list.push(repository);
    reposByInstallation.set(repository.installationId, list);
  }

  const groups = installations.map((installation) => {
    const suspended = installation.suspended_at !== null;
    const repos = reposByInstallation.get(installation.id) ?? [];
    const repositoryRows = sortCoverageRepositories(
      repos.map((repository) => {
        const coverage = deriveRepositoryCoverage(
          latestByRepo.get(repository.id),
          suspended,
        );
        return {
          repositoryId: repository.id,
          fullName: repository.fullName,
          ...coverage,
        };
      }),
    );

    return {
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      repositorySelection: installation.repository_selection,
      repositorySelectionLabel: repositorySelectionLabel(
        installation.repository_selection,
      ),
      installationState: installationStateLabel(suspended),
      suspended,
      htmlUrl: installation.html_url,
      repositoryCount: repositoryRows.length,
      attentionCount: repositoryRows.filter((row) => row.attention).length,
      repositories: repositoryRows,
    };
  });

  return groups.sort((a, b) => a.accountLogin.localeCompare(b.accountLogin));
}

export function buildOverviewSummary(
  groups: InstallationCoverageGroup[],
  reviewsToday: number,
): OverviewSummary {
  return {
    installationCount: groups.length,
    repositoryCount: groups.reduce((sum, group) => sum + group.repositoryCount, 0),
    reviewsToday,
    attentionCount: groups.reduce((sum, group) => sum + group.attentionCount, 0),
  };
}

export function buildOverviewModel(input: {
  installations: AccessibleInstallation[];
  repositories: RepositoryRecord[];
  latestReviews: LatestReviewMetadata[];
  reviewsToday: number;
  recentReviews: OverviewModel["recentReviews"];
}): OverviewModel {
  const groups = buildCoverageGroups(
    input.installations,
    input.repositories,
    input.latestReviews,
  );
  return {
    summary: buildOverviewSummary(groups, input.reviewsToday),
    groups,
    recentReviews: input.recentReviews,
  };
}
