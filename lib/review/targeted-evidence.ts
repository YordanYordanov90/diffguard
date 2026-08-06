import { isSafeRepositoryPath, normalizeRepositoryPath } from "@/lib/repository/path";

import { isUnsupportedContextPath, type FullFileContext } from "./context";
import { riskRank, type DiffFile } from "./diff";
import {
  colocatedTests,
  extractLocalImports,
  resolveImport,
} from "./related-context";

export type TargetedEvidenceCategory =
  | "candidate_source"
  | "direct_callee"
  | "security_defense"
  | "data_contract"
  | "focused_test"
  | "feature_intent";

export type TargetedEvidenceFinding = {
  candidateId: string;
  file: string;
  severity: "high" | "critical";
  category: "security" | "bug" | "quality" | "performance";
};

export type TargetedEvidenceCandidate = {
  file: string;
  reasons: TargetedEvidenceCategory[];
  candidateIds: string[];
};

export type TargetedEvidenceRequirement = {
  candidateId: string;
  requiredCategories: TargetedEvidenceCategory[];
  requiredFiles: string[];
  unresolvedReference: boolean;
};

export type TargetedEvidencePlan = {
  candidates: TargetedEvidenceCandidate[];
  requirements: TargetedEvidenceRequirement[];
};

export type TargetedEvidenceAssessment = {
  completeCandidateIds: string[];
  incompleteCandidateIds: string[];
  missingByCandidate: Record<string, TargetedEvidenceCategory[]>;
};

const SECURITY_PATH_PATTERN = /(?:auth|access|permission|authorize|security|scope|signature|tenant|identity|session|csrf|token|guard)/i;
const SECURITY_FILE_PATTERN = /(?:auth|access|permission|authorize|security|scope|signature|tenant|identity|session|csrf|token|guard)/i;
const DATA_PATH_PATTERN = /(?:db|schema|migration|drizzle|query|queries|repository|installation|transaction|quota|constraint)/i;
const DATA_SOURCE_PATTERN = /(?:installationId|repositoryId|tenant|unique|transaction|quota|constraint|onConflict|advisory)/i;
const LOCAL_REFERENCE_PATTERN = /\b(?:from\s+|import\s*)["'](?:@\/|\.{1,2}\/)|\bimport\s*\(["'](?:@\/|\.{1,2}\/)/;

function repositoryPathSet(repositoryPaths: string[]): Set<string> {
  return new Set(
    repositoryPaths
      .map(normalizeRepositoryPath)
      .filter((path) => isSafeRepositoryPath(path) && !isUnsupportedContextPath(path)),
  );
}

function sourceByPath(
  changedFiles: DiffFile[],
  fullFileContext: FullFileContext[],
): Map<string, string> {
  const sources = new Map<string, string>(
    changedFiles.map((file) => [normalizeRepositoryPath(file.path), file.patch]),
  );
  for (const file of fullFileContext) {
    sources.set(normalizeRepositoryPath(file.file), file.content);
  }
  return sources;
}

function suppliedPaths(
  fullFileContext: FullFileContext[],
  relatedCodeContext: FullFileContext[],
): Set<string> {
  return new Set(
    [...fullFileContext, ...relatedCodeContext].map((file) => normalizeRepositoryPath(file.file)),
  );
}

function candidateNeedsSecurityDefense(
  finding: TargetedEvidenceFinding,
  source: string,
): boolean {
  return (
    finding.category === "security" ||
    SECURITY_PATH_PATTERN.test(finding.file) ||
    SECURITY_FILE_PATTERN.test(source)
  );
}

function candidateNeedsDataContract(finding: TargetedEvidenceFinding, source: string): boolean {
  return DATA_PATH_PATTERN.test(finding.file) || DATA_SOURCE_PATTERN.test(source);
}

function addCandidate(
  candidates: Map<string, { reasons: Set<TargetedEvidenceCategory>; candidateIds: Set<string> }>,
  file: string,
  reason: TargetedEvidenceCategory,
  candidateId: string,
) {
  const normalized = normalizeRepositoryPath(file);
  if (!isSafeRepositoryPath(normalized) || isUnsupportedContextPath(normalized)) return;
  const existing = candidates.get(normalized) ?? {
    reasons: new Set<TargetedEvidenceCategory>(),
    candidateIds: new Set<string>(),
  };
  existing.reasons.add(reason);
  existing.candidateIds.add(candidateId);
  candidates.set(normalized, existing);
}

function addMatchingPaths(
  candidates: Map<string, { reasons: Set<TargetedEvidenceCategory>; candidateIds: Set<string> }>,
  paths: Set<string>,
  pattern: RegExp,
  reason: TargetedEvidenceCategory,
  candidateId: string,
) {
  for (const path of paths) {
    if (pattern.test(path)) addCandidate(candidates, path, reason, candidateId);
  }
}

function categoryPriority(category: TargetedEvidenceCategory): number {
  switch (category) {
    case "candidate_source": return 0;
    case "security_defense": return 1;
    case "data_contract": return 2;
    case "direct_callee": return 3;
    case "feature_intent": return 4;
    case "focused_test": return 5;
  }
}

function candidatePriority(candidate: TargetedEvidenceCandidate): number {
  const categoryPriorityValue = Math.min(...candidate.reasons.map(categoryPriority));
  return categoryPriorityValue * 100 + riskRank({ path: candidate.file, patch: "" });
}

function hasUnresolvedReference(source: string | undefined): boolean {
  return source === undefined || /\bimport\s*\(|\b(?:from\s+|import\s*)["']@\//.test(source);
}

function requiredCategories(
  finding: TargetedEvidenceFinding,
  source: string | undefined,
  supplied: Set<string>,
  importTargets: string[],
): TargetedEvidenceCategory[] {
  const required: TargetedEvidenceCategory[] = [];
  const normalizedFile = normalizeRepositoryPath(finding.file);
  if (!supplied.has(normalizedFile)) required.push("candidate_source");
  if (
    hasUnresolvedReference(source) ||
    importTargets.length > 0 ||
    LOCAL_REFERENCE_PATTERN.test(source ?? "")
  ) {
    required.push("direct_callee");
  }
  if (candidateNeedsSecurityDefense(finding, source ?? "")) {
    required.push("security_defense");
    required.push("feature_intent");
  }
  if (candidateNeedsDataContract(finding, source ?? "")) {
    required.push("data_contract");
  }
  return [...new Set(required)];
}

export function planTargetedSecurityEvidence(params: {
  findings: TargetedEvidenceFinding[];
  changedFiles: DiffFile[];
  fullFileContext: FullFileContext[];
  relatedCodeContext: FullFileContext[];
  repositoryPaths: string[];
  maxFiles?: number;
  requestBudget?: number;
}): TargetedEvidencePlan {
  const maxFiles = params.maxFiles ?? 6;
  const requestBudget = params.requestBudget ?? maxFiles;
  if (
    !Number.isInteger(maxFiles) || maxFiles < 0 ||
    !Number.isInteger(requestBudget) || requestBudget < 0
  ) {
    throw new Error("maxFiles and requestBudget must be non-negative integers.");
  }

  const paths = repositoryPathSet(params.repositoryPaths);
  const sources = sourceByPath(params.changedFiles, params.fullFileContext);
  const supplied = suppliedPaths(params.fullFileContext, params.relatedCodeContext);
  const candidates = new Map<string, { reasons: Set<TargetedEvidenceCategory>; candidateIds: Set<string> }>();
  const requirements: TargetedEvidenceRequirement[] = [];

  for (const finding of params.findings) {
    const file = normalizeRepositoryPath(finding.file);
    const source = sources.get(file);
    const importTargets = source
      ? extractLocalImports(source).flatMap((specifier) => resolveImport(file, specifier, paths))
      : [];
    requirements.push({
      candidateId: finding.candidateId,
      requiredCategories: requiredCategories(finding, source, supplied, importTargets),
      requiredFiles: [
        ...(!supplied.has(file) ? [file] : []),
        ...importTargets,
      ],
      unresolvedReference: hasUnresolvedReference(source),
    });

    if (!supplied.has(file)) addCandidate(candidates, file, "candidate_source", finding.candidateId);
    for (const target of importTargets) {
      addCandidate(candidates, target, "direct_callee", finding.candidateId);
      if (SECURITY_PATH_PATTERN.test(target)) {
        addCandidate(candidates, target, "security_defense", finding.candidateId);
      }
      for (const test of colocatedTests(target, paths)) {
        addCandidate(candidates, test, "focused_test", finding.candidateId);
      }
    }

    if (candidateNeedsSecurityDefense(finding, source ?? "")) {
      addMatchingPaths(candidates, paths, SECURITY_PATH_PATTERN, "security_defense", finding.candidateId);
    }
    if (candidateNeedsDataContract(finding, source ?? "")) {
      addMatchingPaths(candidates, paths, DATA_PATH_PATTERN, "data_contract", finding.candidateId);
    }
    for (const test of colocatedTests(file, paths)) {
      addCandidate(candidates, test, "focused_test", finding.candidateId);
    }
    if (paths.has("context/architecture.md")) {
      addCandidate(candidates, "context/architecture.md", "feature_intent", finding.candidateId);
    }
  }

  const plannedCandidates = [...candidates.entries()]
    .map(([file, value]) => ({
      file,
      reasons: [...value.reasons].sort((left, right) => categoryPriority(left) - categoryPriority(right)),
      candidateIds: [...value.candidateIds].sort(),
    }))
    .sort((left, right) => candidatePriority(left) - candidatePriority(right) || left.file.localeCompare(right.file))
    .slice(0, Math.min(maxFiles, requestBudget));

  return { candidates: plannedCandidates, requirements };
}

export function assessTargetedSecurityEvidence(
  plan: TargetedEvidencePlan,
  fetchedFiles: Array<Pick<TargetedEvidenceCandidate, "file" | "reasons" | "candidateIds">>,
): TargetedEvidenceAssessment {
  const availableByCandidate = new Map<string, Set<TargetedEvidenceCategory>>();
  const availablePathsByCandidate = new Map<string, Set<string>>();
  for (const file of fetchedFiles) {
    for (const candidateId of file.candidateIds) {
      const categories = availableByCandidate.get(candidateId) ?? new Set<TargetedEvidenceCategory>();
      for (const reason of file.reasons) categories.add(reason);
      availableByCandidate.set(candidateId, categories);
      const paths = availablePathsByCandidate.get(candidateId) ?? new Set<string>();
      paths.add(normalizeRepositoryPath(file.file));
      availablePathsByCandidate.set(candidateId, paths);
    }
  }

  const completeCandidateIds: string[] = [];
  const incompleteCandidateIds: string[] = [];
  const missingByCandidate: Record<string, TargetedEvidenceCategory[]> = {};
  for (const requirement of plan.requirements) {
    const available = availableByCandidate.get(requirement.candidateId) ?? new Set();
    const availablePaths = availablePathsByCandidate.get(requirement.candidateId) ?? new Set();
    const missing = requirement.requiredCategories.filter((category) => !available.has(category));
    if (requirement.requiredFiles.some((file) => !availablePaths.has(file))) {
      missing.push("direct_callee");
    }
    if (requirement.unresolvedReference) missing.push("direct_callee");
    const uniqueMissing = [...new Set(missing)];
    if (uniqueMissing.length === 0) {
      completeCandidateIds.push(requirement.candidateId);
    } else {
      incompleteCandidateIds.push(requirement.candidateId);
      missingByCandidate[requirement.candidateId] = uniqueMissing;
    }
  }
  return { completeCandidateIds, incompleteCandidateIds, missingByCandidate };
}
