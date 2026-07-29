import {
  INLINE_COMMENT_CAP,
  INLINE_SUGGESTION_MAX_CHARS,
  INLINE_SUGGESTION_MAX_LINES,
} from "@/lib/config/constants";
import { normalizeRepositoryPath } from "@/lib/repository/path";

import { riskRank, type DiffFile } from "./diff";
import type {
  Category,
  FindingConfidence,
  Severity,
  SuggestedChange,
} from "./schema";

export type InlineFindingInput = {
  id: string;
  fingerprint: string;
  githubCommentId: number | null;
  confidence: FindingConfidence;
  severity: Severity;
  category: Category;
  file: string;
  line: number | null;
  title: string;
  detail: string;
  suggestion: string | null;
  suggestedChange: SuggestedChange | null;
};

export type PreparedInlineComment = {
  findingId: string;
  fingerprint: string;
  path: string;
  line: number;
  side: "RIGHT";
  startLine?: number;
  startSide?: "RIGHT";
  body: string;
  hasSuggestion: boolean;
};

export type InlinePlan = {
  comments: PreparedInlineComment[];
  /** Confirmed findings that appear only in the summary (cap, eligibility, or already published). */
  summaryOnlyCount: number;
  inlinedCount: number;
};

const severityRank: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const categoryRank: Record<Category, number> = {
  security: 0,
  bug: 1,
  quality: 2,
  performance: 3,
};

const severityBadge: Record<Severity, string> = {
  critical: "🔴 Critical",
  high: "🟠 High",
  medium: "🟡 Medium",
  low: "⚪ Low",
  info: "ℹ️ Info",
};

type NewFileLine = {
  content: string;
  hunkIndex: number;
};

function changedRightLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let currentLine = 0;
  let inHunk = false;

  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      currentLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) {
      lines.add(currentLine);
      currentLine += 1;
    } else if (line.startsWith(" ")) {
      currentLine += 1;
    }
  }
  return lines;
}

/**
 * Map new-file line numbers to content and hunk index for RIGHT-side validation.
 * Context and added lines are included; pure deletions are not on the right side.
 */
export function mapNewFileLines(patch: string): Map<number, NewFileLine> {
  const map = new Map<number, NewFileLine>();
  let currentLine = 0;
  let inHunk = false;
  let hunkIndex = -1;

  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      currentLine = Number(hunk[1]);
      inHunk = true;
      hunkIndex += 1;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+") || line.startsWith(" ")) {
      map.set(currentLine, {
        content: line.slice(1),
        hunkIndex,
      });
      currentLine += 1;
    }
  }
  return map;
}

export function isAddedLine(patch: string, line: number): boolean {
  return changedRightLines(patch).has(line);
}

function isEligibleSeverity(severity: Severity): boolean {
  return severity === "critical" || severity === "high" || severity === "medium";
}

function isPrioritySeverity(severity: Severity): boolean {
  return severity === "critical" || severity === "high";
}

function sortInlineCandidates(findings: InlineFindingInput[]): InlineFindingInput[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((left, right) => {
      const leftFile = { path: left.finding.file, patch: "" };
      const rightFile = { path: right.finding.file, patch: "" };
      return (
        categoryRank[left.finding.category] - categoryRank[right.finding.category] ||
        severityRank[left.finding.severity] - severityRank[right.finding.severity] ||
        riskRank(leftFile) - riskRank(rightFile) ||
        left.index - right.index
      );
    })
    .map(({ finding }) => finding);
}

/**
 * Validate a suggested change against the reviewed patch.
 * Returns null when the range is unsafe or not fully contained in one hunk.
 */
export function validateSuggestedChange(
  patch: string,
  suggestedChange: SuggestedChange,
): SuggestedChange | null {
  const { startLine, endLine, replacement } = suggestedChange;
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  ) {
    return null;
  }

  const lineCount = endLine - startLine + 1;
  if (lineCount > INLINE_SUGGESTION_MAX_LINES) return null;
  if (replacement.length > INLINE_SUGGESTION_MAX_CHARS) return null;
  if (replacement.includes("\0")) return null;

  const replacementLines = replacement.split("\n");
  // GitHub suggestions often omit a trailing newline on the last line.
  const normalizedReplacementLines =
    replacementLines.length > 0 && replacementLines.at(-1) === ""
      ? replacementLines.slice(0, -1)
      : replacementLines;
  if (normalizedReplacementLines.length > INLINE_SUGGESTION_MAX_LINES) return null;

  const newLines = mapNewFileLines(patch);
  let hunkIndex: number | null = null;
  for (let line = startLine; line <= endLine; line += 1) {
    const mapped = newLines.get(line);
    if (!mapped) return null;
    if (hunkIndex === null) hunkIndex = mapped.hunkIndex;
    else if (mapped.hunkIndex !== hunkIndex) return null;
  }

  return {
    startLine,
    endLine,
    replacement,
  };
}

export function renderInlineCommentBody(input: {
  severity: Severity;
  title: string;
  detail: string;
  suggestion: string | null;
  suggestedChange: SuggestedChange | null;
}): string {
  const lines = [
    `**${severityBadge[input.severity]} · ${input.title}**`,
    "",
    input.detail,
  ];
  if (input.suggestion) {
    lines.push("", `**Suggestion:** ${input.suggestion}`);
  }
  if (input.suggestedChange) {
    lines.push(
      "",
      "```suggestion",
      input.suggestedChange.replacement.replace(/\n$/, ""),
      "```",
    );
  }
  return lines.join("\n");
}

function prepareComment(
  finding: InlineFindingInput,
  patch: string,
): PreparedInlineComment | null {
  if (finding.line === null) return null;
  if (!isAddedLine(patch, finding.line)) return null;

  const path = normalizeRepositoryPath(finding.file);
  let suggestedChange: SuggestedChange | null = null;
  if (finding.suggestedChange) {
    suggestedChange = validateSuggestedChange(patch, finding.suggestedChange);
  }

  if (suggestedChange) {
    // Anchor multi-line suggestion comments to the validated range.
    const multiLine = suggestedChange.startLine !== suggestedChange.endLine;
    return {
      findingId: finding.id,
      fingerprint: finding.fingerprint,
      path,
      line: suggestedChange.endLine,
      side: "RIGHT",
      ...(multiLine
        ? {
            startLine: suggestedChange.startLine,
            startSide: "RIGHT" as const,
          }
        : {}),
      body: renderInlineCommentBody({
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        suggestion: finding.suggestion,
        suggestedChange,
      }),
      hasSuggestion: true,
    };
  }

  return {
    findingId: finding.id,
    fingerprint: finding.fingerprint,
    path,
    line: finding.line,
    side: "RIGHT",
    body: renderInlineCommentBody({
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      suggestion: finding.suggestion,
      suggestedChange: null,
    }),
    hasSuggestion: false,
  };
}

/**
 * Select up to INLINE_COMMENT_CAP high-confidence findings for a single
 * GitHub COMMENT review. Skips already-published fingerprints and fails
 * closed on unmapped locations.
 */
export function planInlineComments(
  findings: InlineFindingInput[],
  changedFiles: DiffFile[],
  cap: number = INLINE_COMMENT_CAP,
): InlinePlan {
  const patches = new Map(
    changedFiles.map((file) => [normalizeRepositoryPath(file.path), file.patch]),
  );

  const unpublished = findings.filter((finding) => finding.githubCommentId === null);

  const mappable = unpublished.filter((finding) => {
    if (finding.confidence !== "high") return false;
    if (!isEligibleSeverity(finding.severity)) return false;
    if (finding.line === null) return false;
    const patch = patches.get(normalizeRepositoryPath(finding.file));
    if (!patch) return false;
    return isAddedLine(patch, finding.line);
  });

  const ordered = sortInlineCandidates(mappable);
  const selected: InlineFindingInput[] = [];
  for (const finding of ordered) {
    if (selected.length >= cap) break;
    if (isPrioritySeverity(finding.severity)) {
      selected.push(finding);
      continue;
    }
    // Medium findings fill remaining slots only (noise cap).
    if (finding.severity === "medium") {
      selected.push(finding);
    }
  }

  const comments: PreparedInlineComment[] = [];
  for (const finding of selected) {
    const patch = patches.get(normalizeRepositoryPath(finding.file));
    if (!patch) continue;
    const prepared = prepareComment(finding, patch);
    if (prepared) comments.push(prepared);
  }

  const inlinedIds = new Set(comments.map((comment) => comment.findingId));
  const previouslyPublishedIds = new Set(
    findings
      .filter((finding) => finding.githubCommentId !== null)
      .map((finding) => finding.id),
  );
  const summaryOnlyCount = findings.filter(
    (finding) =>
      !inlinedIds.has(finding.id) && !previouslyPublishedIds.has(finding.id),
  ).length;

  return {
    comments,
    summaryOnlyCount,
    inlinedCount: comments.length,
  };
}

/** Strip suggestion blocks for a safer GitHub retry payload. */
export function stripInlineSuggestions(
  comments: PreparedInlineComment[],
): PreparedInlineComment[] {
  return comments.map((comment) => {
    if (!comment.hasSuggestion) return comment;
    const body = comment.body
      .replace(/\n```suggestion\n[\s\S]*?\n```$/, "")
      .trimEnd();
    return {
      findingId: comment.findingId,
      fingerprint: comment.fingerprint,
      path: comment.path,
      line: comment.line,
      side: "RIGHT" as const,
      body,
      hasSuggestion: false,
    };
  });
}
