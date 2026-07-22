import type { Finding, ReviewOutput, Severity } from "./schema";

export type RenderMetadata = {
  filesReviewed: number;
  skippedFiles: string[];
  headSha: string;
};

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

  const skippedFiles = renderSkippedFiles(metadata.skippedFiles);
  if (skippedFiles) sections.push("", skippedFiles);
  sections.push("", "---", `🛡️ DiffGuard · reviewed commit \`${metadata.headSha.slice(0, 7)}\``);
  return sections.join("\n");
}
