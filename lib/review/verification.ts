import type { TargetedEvidenceAssessment } from "./targeted-evidence";
import {
  securityVerificationOutputSchema,
  type Finding,
  type FindingCandidate,
  type SecurityVerificationDecision,
  type Severity,
} from "./schema";

export type VerifiableCandidate = FindingCandidate & { candidateId: string };

export type SecurityVerificationResult = {
  candidates: VerifiableCandidate[];
  review: {
    summary: string;
    verdict: "approve" | "comment" | "concerns";
    findings: Finding[];
  };
  verifiedCount: number;
  downgradedCount: number;
  rejectedCount: number;
  manualCount: number;
  malformed: boolean;
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function isSevere(severity: Severity): boolean {
  return severity === "high" || severity === "critical";
}

function hasConcreteVerification(decision: SecurityVerificationDecision): boolean {
  return decision.evidenceComplete &&
    decision.missingEvidence.length === 0 &&
    typeof decision.attackPreconditions === "string" && decision.attackPreconditions.trim().length > 0 &&
    typeof decision.exploitPath === "string" && decision.exploitPath.trim().length > 0 &&
    typeof decision.trustBoundary === "string" && decision.trustBoundary.trim().length > 0 &&
    typeof decision.impact === "string" && decision.impact.trim().length > 0 &&
    decision.defensesChecked.length > 0;
}

function hasExactDecisionSet(
  candidates: VerifiableCandidate[],
  decisions: SecurityVerificationDecision[],
): boolean {
  const ids = new Set(candidates.map((candidate) => candidate.candidateId));
  if (decisions.length !== candidates.length) return false;
  const seen = new Set<string>();
  for (const decision of decisions) {
    if (!ids.has(decision.candidateId) || seen.has(decision.candidateId)) return false;
    if (
      decision.duplicateOfCandidateId !== null &&
      (!ids.has(decision.duplicateOfCandidateId) ||
        decision.duplicateOfCandidateId === decision.candidateId)
    ) {
      return false;
    }
    seen.add(decision.candidateId);
  }
  return seen.size === ids.size;
}

function isValidDecision(
  candidate: VerifiableCandidate,
  decision: SecurityVerificationDecision,
  completeIds: Set<string>,
): boolean {
  if (decision.decision === "rejected" || decision.decision === "manual_verification") {
    return decision.finalSeverity === null;
  }
  if (!completeIds.has(candidate.candidateId) || !hasConcreteVerification(decision)) return false;
  if (decision.decision === "verified") {
    return decision.finalSeverity === candidate.severity;
  }
  return decision.finalSeverity !== null &&
    SEVERITY_RANK[decision.finalSeverity] < SEVERITY_RANK[candidate.severity] &&
    !isSevere(decision.finalSeverity);
}

function toFinding(candidate: VerifiableCandidate): Finding {
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

function reviewFromCandidates(candidates: VerifiableCandidate[]) {
  const findings = candidates.map(toFinding);
  return {
    summary: findings.length === 0
      ? "No actionable findings were confirmed."
      : `DiffGuard confirmed ${findings.length} actionable finding${findings.length === 1 ? "" : "s"} after independent verification.`,
    verdict: findings.length === 0 ? "approve" as const : "concerns" as const,
    findings,
  };
}

function mergeDuplicates(
  candidates: VerifiableCandidate[],
  decisions: Map<string, SecurityVerificationDecision>,
): VerifiableCandidate[] {
  const parent = new Map(candidates.map((candidate) => [candidate.candidateId, candidate.candidateId]));
  const find = (id: string): string => {
    const root = parent.get(id);
    if (!root || root === id) return id;
    const resolved = find(root);
    parent.set(id, resolved);
    return resolved;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (const decision of decisions.values()) {
    if (decision.duplicateOfCandidateId !== null) {
      union(decision.candidateId, decision.duplicateOfCandidateId);
    }
  }

  const groups = new Map<string, VerifiableCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(find(candidate.candidateId)) ?? [];
    group.push(candidate);
    groups.set(find(candidate.candidateId), group);
  }
  return [...groups.values()].flatMap((group) => {
    const selected = [...group].sort(
      (left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] ||
        left.candidateId.localeCompare(right.candidateId),
    )[0];
    return selected ? [selected] : [];
  });
}

export function applySecurityVerification(
  candidates: VerifiableCandidate[],
  output: unknown,
  assessment: TargetedEvidenceAssessment,
): SecurityVerificationResult {
  const parsed = securityVerificationOutputSchema.safeParse(output);
  if (!parsed.success || !hasExactDecisionSet(candidates, parsed.data.decisions)) {
    return {
      candidates: [],
      review: reviewFromCandidates([]),
      verifiedCount: 0,
      downgradedCount: 0,
      rejectedCount: candidates.length,
      manualCount: 0,
      malformed: true,
    };
  }

  const completeIds = new Set(assessment.completeCandidateIds);
  const decisions = new Map(parsed.data.decisions.map((decision) => [decision.candidateId, decision]));
  const publishable: VerifiableCandidate[] = [];
  let verifiedCount = 0;
  let downgradedCount = 0;
  let rejectedCount = 0;
  let manualCount = 0;

  for (const candidate of candidates) {
    const decision = decisions.get(candidate.candidateId);
    if (!decision) {
      rejectedCount += 1;
      continue;
    }
    if (decision.decision === "rejected") {
      rejectedCount += 1;
      continue;
    }
    if (decision.decision === "manual_verification") {
      manualCount += 1;
      continue;
    }
    if (!isValidDecision(candidate, decision, completeIds)) {
      manualCount += 1;
      continue;
    }
    const verifiedCandidate = decision.decision === "downgraded" && decision.finalSeverity
      ? { ...candidate, severity: decision.finalSeverity }
      : candidate;
    publishable.push(verifiedCandidate);
    if (decision.decision === "verified") verifiedCount += 1;
    else downgradedCount += 1;
  }

  const merged = mergeDuplicates(publishable, decisions);
  rejectedCount += publishable.length - merged.length;
  return {
    candidates: merged,
    review: reviewFromCandidates(merged),
    verifiedCount,
    downgradedCount,
    rejectedCount,
    manualCount,
    malformed: false,
  };
}

export function buildVerifiedReview(candidates: VerifiableCandidate[]) {
  return reviewFromCandidates(candidates);
}
