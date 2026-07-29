import { createHash } from "node:crypto";

import { normalizeRepositoryPath } from "@/lib/repository/path";

import type { DiffFile } from "./diff";
import type {
  ConfirmedFinding,
  FindingCandidate,
  SuggestedChange,
} from "./schema";
import { suggestedChangeSchema } from "./schema";

export type FingerprintInput = Pick<
  FindingCandidate,
  | "category"
  | "file"
  | "line"
  | "violatedInvariant"
  | "observedBehavior"
  | "causalPath"
>;

export type PersistableFinding = {
  fingerprint: string;
  confidence: ConfirmedFinding["confidence"];
  severity: ConfirmedFinding["severity"];
  category: ConfirmedFinding["category"];
  file: string;
  line: number | null;
  title: string;
  detail: string;
  observedBehavior: string;
  causalPath: string;
  violatedInvariant: string;
  suggestion: string | null;
  suggestedChange: SuggestedChange | null;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Trusted, deterministic finding identity.
 * Built from normalized semantics plus a one-way evidence anchor.
 * Never includes reversible source fragments or LLM-supplied ids.
 */
export function computeFindingFingerprint(input: FingerprintInput): string {
  const file = normalizeRepositoryPath(input.file);
  const lineKey = input.line === null ? "file" : String(input.line);
  const semantics = [
    input.category,
    file,
    lineKey,
    normalizeText(input.violatedInvariant),
  ].join("\0");

  const contextAnchor = sha256Hex(
    [
      normalizeText(input.observedBehavior),
      normalizeText(input.causalPath),
    ].join("\0"),
  );

  return sha256Hex(`${semantics}\0${contextAnchor}`);
}

function changedLines(patch: string): Set<number> {
  const lines = patch.split("\n");
  const result = new Set<number>();
  let currentLine = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      currentLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) {
      result.add(currentLine);
      currentLine += 1;
    } else if (line.startsWith(" ")) {
      currentLine += 1;
    }
  }
  return result;
}

function validateSuggestedChange(
  value: SuggestedChange | null,
): SuggestedChange | null {
  if (value === null) return null;
  const parsed = suggestedChangeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Map confirmed candidates to durable finding rows.
 * Invalid line locations degrade to file-level findings (line = null).
 */
export function toPersistableFindings(
  confirmed: ConfirmedFinding[],
  changedFiles: DiffFile[],
): PersistableFinding[] {
  const files = new Map(
    changedFiles.map((file) => [normalizeRepositoryPath(file.path), file]),
  );

  return confirmed.map((finding) => {
    const file = normalizeRepositoryPath(finding.file);
    const diffFile = files.get(file);
    let line = finding.line;
    if (line !== null) {
      const mapped =
        diffFile !== undefined && changedLines(diffFile.patch).has(line);
      if (!mapped) line = null;
    }

    return {
      fingerprint: computeFindingFingerprint({
        category: finding.category,
        file,
        line,
        violatedInvariant: finding.violatedInvariant,
        observedBehavior: finding.observedBehavior,
        causalPath: finding.causalPath,
      }),
      confidence: finding.confidence,
      severity: finding.severity,
      category: finding.category,
      file,
      line,
      title: finding.title,
      detail: finding.detail,
      observedBehavior: finding.observedBehavior,
      causalPath: finding.causalPath,
      violatedInvariant: finding.violatedInvariant,
      suggestion: finding.suggestion,
      suggestedChange: validateSuggestedChange(finding.suggestedChange),
    };
  });
}
