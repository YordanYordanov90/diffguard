import { normalizeRepositoryPath } from "@/lib/repository/path";

import type { DiffFile } from "./diff";
import type {
  AdjudicationOutput,
  Finding,
  FindingCandidate,
} from "./schema";

export type AllowlistedCandidate = FindingCandidate & { candidateId: string };

export type PreparedCandidates = {
  candidates: AllowlistedCandidate[];
  rejectedCount: number;
};

export type EvidenceDecision = {
  review: {
    summary: string;
    verdict: AdjudicationOutput["verdict"];
    findings: Finding[];
  };
  rejectedCount: number;
  manualCount: number;
};

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

function diffFileMap(files: DiffFile[]): Map<string, DiffFile> {
  return new Map(files.map((file) => [normalizeRepositoryPath(file.path), file]));
}

function hasRequiredEvidence(candidate: FindingCandidate): boolean {
  return [
    candidate.observedBehavior,
    candidate.causalPath,
    candidate.violatedInvariant,
  ].every((value) => value.trim().length > 0);
}

function hasMappedLocation(candidate: FindingCandidate, file: DiffFile): boolean {
  if (candidate.line === null) return true;
  return changedLines(file.patch).has(candidate.line);
}

export function prepareCandidates(
  candidates: FindingCandidate[],
  changedFiles: DiffFile[],
): PreparedCandidates {
  const files = diffFileMap(changedFiles);
  const prepared: AllowlistedCandidate[] = [];
  let rejectedCount = 0;

  candidates.forEach((candidate, index) => {
    const file = files.get(normalizeRepositoryPath(candidate.file));
    const valid = file !== undefined &&
      hasRequiredEvidence(candidate) &&
      !candidate.requiresRuntimeVerification &&
      hasMappedLocation(candidate, file);
    if (!valid) {
      rejectedCount += 1;
      return;
    }
    prepared.push({ ...candidate, file: normalizeRepositoryPath(candidate.file), candidateId: `candidate-${index + 1}` });
  });

  return { candidates: prepared, rejectedCount };
}

export function getRelevantDiffHunks(
  candidates: AllowlistedCandidate[],
  changedFiles: DiffFile[],
): Record<string, string> {
  const files = diffFileMap(changedFiles);
  return Object.fromEntries(
    candidates.map((candidate) => {
      const file = files.get(candidate.file);
      return [candidate.file, file?.patch ?? "(missing)"];
    }),
  );
}

function toFinding(candidate: AllowlistedCandidate): Finding {
  return {
    severity: candidate.severity,
    category: candidate.category,
    file: candidate.file,
    line: candidate.line,
    title: candidate.title,
    detail: candidate.detail,
    suggestion: candidate.suggestion,
  };
}

export function applyAdjudication(
  candidates: AllowlistedCandidate[],
  adjudication: AdjudicationOutput,
  initiallyRejectedCount = 0,
): EvidenceDecision {
  const allowlistedIds = new Set(candidates.map((candidate) => candidate.candidateId));
  const decisions = new Map<string, AdjudicationOutput["decisions"][number]>();
  const duplicateIds = new Set<string>();

  for (const decision of adjudication.decisions) {
    if (!allowlistedIds.has(decision.candidateId)) continue;
    if (decisions.has(decision.candidateId)) {
      duplicateIds.add(decision.candidateId);
      continue;
    }
    decisions.set(decision.candidateId, decision);
  }

  const confirmed: Finding[] = [];
  let rejectedCount = initiallyRejectedCount;
  let manualCount = 0;
  for (const candidate of candidates) {
    const decision = decisions.get(candidate.candidateId);
    if (!decision || duplicateIds.has(candidate.candidateId) || decision.decision === "rejected") {
      rejectedCount += 1;
    } else if (decision.decision === "manual_verification") {
      manualCount += 1;
    } else {
      confirmed.push(toFinding(candidate));
    }
  }

  const review = confirmed.length === 0
    ? emptyGatedReview()
    : {
        summary: adjudication.summary,
        verdict: adjudication.verdict,
        findings: confirmed,
      };

  return {
    review,
    rejectedCount,
    manualCount,
  };
}

export function emptyGatedReview(): EvidenceDecision["review"] {
  return {
    summary: "No actionable findings were confirmed.",
    verdict: "approve",
    findings: [],
  };
}
