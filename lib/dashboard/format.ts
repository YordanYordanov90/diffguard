import type { ListReviewsRow, DashboardReview } from "./types";

export function toDashboardReview(row: ListReviewsRow): DashboardReview {
  const { review, repositoryName } = row;
  return {
    id: review.id,
    repositoryName,
    prNumber: review.prNumber,
    headSha: review.headSha,
    status: review.status,
    skipReason: review.skipReason,
    findingsCount:
      review.findingsCritical +
      review.findingsHigh +
      review.findingsMedium +
      review.findingsLow +
      review.findingsInfo,
    model: review.model,
    durationMs: review.durationMs,
    reviewMarkdown: review.reviewMarkdown,
    error: review.error,
    createdAt: review.createdAt.toISOString(),
  };
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}m ${rem}s`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function githubPrUrl(repositoryName: string, prNumber: number): string {
  return `https://github.com/${repositoryName}/pull/${prNumber}`;
}

export function formatSkipReason(reason: string): string {
  return reason.replaceAll("_", " ");
}

export {
  formatCoverageDetail,
  formatRelativeTime,
  repositorySelectionLabel,
  installationStateLabel,
} from "./coverage";
