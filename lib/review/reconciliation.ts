import { normalizeRepositoryPath } from "@/lib/repository/path";

import type { DiffFile } from "./diff";
import type { Finding, FindingUpdate } from "./schema";

export type OpenFinding = {
  id: string;
  file: string;
  line: number | null;
  title: string;
  detail: string;
  severity: Finding["severity"];
  category: Finding["category"];
  suggestion: string | null;
};

export function selectEligibleFindings(
  findings: OpenFinding[],
  changedFiles: DiffFile[],
): OpenFinding[] {
  const changedPaths = new Set(
    changedFiles.map((file) => normalizeRepositoryPath(file.path)),
  );
  return findings.filter((finding) => changedPaths.has(normalizeRepositoryPath(finding.file)));
}

export function selectResolvedFindingIds(
  updates: FindingUpdate[],
  eligibleFindings: OpenFinding[],
): string[] {
  const eligibleIds = new Set(eligibleFindings.map((finding) => finding.id));
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const update of updates) {
    if (!eligibleIds.has(update.findingId) || seen.has(update.findingId)) continue;
    seen.add(update.findingId);
    if (update.status === "resolved") resolved.push(update.findingId);
  }
  return resolved;
}

export function toFinding(finding: OpenFinding): Finding {
  return {
    severity: finding.severity,
    category: finding.category,
    file: finding.file,
    line: finding.line,
    title: finding.title,
    detail: finding.detail,
    suggestion: finding.suggestion,
  };
}
