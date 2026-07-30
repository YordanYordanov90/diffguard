import type { ReviewMode } from "./baseline";
import type { Finding, ReviewOutput, Severity } from "./schema";

export type RenderMetadata = {
  filesReviewed: number;
  skippedFiles: string[];
  headSha: string;
  reviewMode?: ReviewMode;
  comparedFromSha?: string | null;
  /** When set and > 0, disclose that some findings have no inline comment. */
  summaryOnlyFindingCount?: number;
  inlineCommentCount?: number;
  reconciliation?: {
    newFindings: Finding[];
    recurringFindings: Finding[];
    stillOpenFindings: Finding[];
    resolvedFindings: Finding[];
  };
};

type ReconciliationMetadata = NonNullable<RenderMetadata["reconciliation"]>;

const severityRank: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const severityBadge: Record<Severity, string> = {
  critical: "🔴 Critical",
  high: "🟠 High",
  medium: "🟡 Medium",
  low: "⚪ Low",
  info: "ℹ️ Info",
};

function isCollapsedSeverity(finding: Finding): boolean {
  return finding.severity === "low" || finding.severity === "info";
}

function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort(
      (left, right) =>
        severityRank[left.finding.severity] - severityRank[right.finding.severity] ||
        left.index - right.index,
    )
    .map(({ finding }) => finding);
}

function renderFinding(finding: Finding): string {
  const location = finding.line === null
    ? `\`${finding.file}\` (file-level)`
    : `\`${finding.file}:${finding.line}\``;
  const lines = [
    `- **${severityBadge[finding.severity]} · ${finding.title}** — ${location}`,
    `  ${finding.detail}`,
  ];
  if (finding.suggestion !== null) lines.push(`  **Suggestion:** ${finding.suggestion}`);
  return lines.join("\n");
}

function renderFindings(findings: Finding[]): string {
  return sortFindings(findings).map(renderFinding).join("\n\n");
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderSummary(review: ReviewOutput, filesReviewed: number): string {
  const securityCount = review.findings.filter(
    (finding) => finding.category === "security" &&
      (finding.severity === "critical" || finding.severity === "high"),
  ).length;
  return `Reviewed ${pluralize(filesReviewed, "file")} — ${pluralize(securityCount, "high-severity security issue")}, ${pluralize(review.findings.length, "suggestion")}.`;
}

function renderSkippedFiles(skippedFiles: string[]): string {
  if (skippedFiles.length === 0) return "";
  return [
    "<details>",
    `<summary>Skipped files (${skippedFiles.length})</summary>`,
    "",
    "These files were not included in the review:",
    "",
    skippedFiles.map((file) => `- \`${file}\``).join("\n"),
    "",
    "</details>",
  ].join("\n");
}

export function renderReview(review: ReviewOutput, metadata: RenderMetadata): string {
  if (metadata.reconciliation) {
    return renderReconciledReview(review, metadata, metadata.reconciliation);
  }
  const visibleFindings = review.findings.filter((finding) => !isCollapsedSeverity(finding));
  const collapsedFindings = review.findings.filter(isCollapsedSeverity);
  const securityFindings = visibleFindings.filter((finding) => finding.category === "security");
  const otherFindings = visibleFindings.filter((finding) => finding.category !== "security");
  const sections = [
    "### 🛡️ DiffGuard Review",
    "",
    renderSummary(review, metadata.filesReviewed),
    "",
    `> ${review.summary}`,
  ];

  if (securityFindings.length > 0) sections.push("", "## Security findings", "", renderFindings(securityFindings));
  if (otherFindings.length > 0) sections.push("", "## Other findings", "", renderFindings(otherFindings));
  if (collapsedFindings.length > 0) {
    sections.push(
      "",
      "<details>",
      `<summary>Low-severity and informational findings (${collapsedFindings.length})</summary>`,
      "",
      renderFindings(collapsedFindings),
      "",
      "</details>",
    );
  }

  const inlineCount = metadata.inlineCommentCount ?? 0;
  const summaryOnly = metadata.summaryOnlyFindingCount ?? 0;
  if (review.findings.length > 0 && (inlineCount > 0 || summaryOnly > 0)) {
    let disclosure: string;
    if (inlineCount > 0 && summaryOnly > 0) {
      disclosure = `_${inlineCount} finding${inlineCount === 1 ? "" : "s"} also posted as inline comment${inlineCount === 1 ? "" : "s"}; ${summaryOnly} remain summary-only (high-confidence critical/high first, max 8 inline)._`;
    } else if (inlineCount > 0) {
      disclosure = `_${inlineCount} finding${inlineCount === 1 ? "" : "s"} also posted as inline comment${inlineCount === 1 ? "" : "s"}._`;
    } else {
      disclosure = `_${summaryOnly} finding${summaryOnly === 1 ? "" : "s"} remain summary-only (inline comments require a mapped high-confidence critical/high/medium line, max 8)._`;
    }
    sections.push("", disclosure);
  }

  const skippedFiles = renderSkippedFiles(metadata.skippedFiles);
  if (skippedFiles) sections.push("", skippedFiles);
  sections.push("", "---", renderFooter(metadata));
  return sections.join("\n");
}

function renderReconciledReview(
  review: ReviewOutput,
  metadata: RenderMetadata,
  reconciliation: ReconciliationMetadata,
): string {
  const sections = [
    "### 🛡️ DiffGuard Review",
    "",
    renderSummary(review, metadata.filesReviewed),
    "",
    `> ${review.summary}`,
  ];
  if (reconciliation.newFindings.length > 0) {
    sections.push("", "## New findings", "", renderFindings(reconciliation.newFindings));
  }
  if (reconciliation.recurringFindings.length > 0) {
    sections.push("", "## Recurring findings", "", renderFindings(reconciliation.recurringFindings));
  }
  if (reconciliation.stillOpenFindings.length > 0) {
    sections.push("", "## Still open", "", renderFindings(reconciliation.stillOpenFindings));
  }
  if (reconciliation.resolvedFindings.length > 0) {
    sections.push("", "## Resolved in this update", "", renderFindings(reconciliation.resolvedFindings));
  }
  const skippedFiles = renderSkippedFiles(metadata.skippedFiles);
  if (skippedFiles) sections.push("", skippedFiles);
  sections.push("", "---", renderFooter(metadata));
  return sections.join("\n");
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function renderFooter(metadata: RenderMetadata): string {
  const head = shortSha(metadata.headSha);
  const mode = metadata.reviewMode ?? "full";
  const from = metadata.comparedFromSha;

  if (mode === "incremental" && from) {
    return `🛡️ DiffGuard · reviewed commit \`${head}\` · incremental \`${shortSha(from)}\`…\`${head}\``;
  }
  if (mode === "fallback_full") {
    return `🛡️ DiffGuard · reviewed commit \`${head}\` · full review (fallback)`;
  }
  return `🛡️ DiffGuard · reviewed commit \`${head}\` · full review`;
}
