import { RELATED_CODE_CONTEXT_MAX_FILES } from "@/lib/config/constants";
import { isUnsupportedContextPath } from "./context";
import { riskRank, type DiffFile } from "./diff";
import type { FullFileContext } from "./context";
import { isSafeRepositoryPath, normalizeRepositoryPath } from "@/lib/repository/path";

export type RelatedCodeReason =
  | "direct_import"
  | "colocated_test"
  | "public_contract";

export type RelatedCodeCandidate = {
  file: string;
  reasons: RelatedCodeReason[];
};

export type RelatedCodePlan = {
  candidates: RelatedCodeCandidate[];
};

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const TEST_SUFFIXES = [".test", ".spec"];
const STATIC_IMPORT_PATTERN = /^(?:import\s+(?:type\s+)?(?:[^'\"]+\s+from\s+)?|export\s+[^'\"]+\s+from\s+)["']([^"']+)["']/;

function isTestPath(path: string): boolean {
  return path.split("/").some((segment) =>
    ["test", "tests", "spec", "__tests__", "__mocks__"].includes(segment.toLowerCase()),
  ) || /\.(?:test|spec)\.[^.]+$/i.test(path);
}

function isPublicContract(content: string): boolean {
  return /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:class|const|enum|function|interface|type)\b/m.test(
    content,
  ) || /^\s*export\s*\{[^}]+\}/m.test(content);
}

export function extractLocalImports(content: string): string[] {
  const imports = new Set<string>();
  const lines = (content.includes("diff --git ")
    ? content
        .split("\n")
        .filter((line) => !line.startsWith("-"))
        .map((line) => (line.startsWith("+") && !line.startsWith("+++") ? line.slice(1) : line))
    : content.split("\n"));
  let declarationLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    const startsStaticDeclaration = /^(?:import\s|export\s)/.test(trimmed);
    if (declarationLines.length === 0 && !startsStaticDeclaration) {
      const required = trimmed.match(/\brequire\(["']([^"']+)["']\)/);
      if (required?.[1]?.startsWith(".")) imports.add(required[1]);
      continue;
    }
    if (declarationLines.length === 0 && trimmed.startsWith("import(")) continue;
    declarationLines.push(trimmed);
    const declaration = declarationLines.join(" ").match(STATIC_IMPORT_PATTERN);
    const specifier = declaration?.[1];
    if (specifier?.startsWith(".")) imports.add(specifier);
    if (declaration || trimmed.endsWith(";") || declarationLines.length >= 8) {
      declarationLines = [];
    }
  }
  return [...imports];
}

export function resolveImport(sourcePath: string, specifier: string, repositoryPaths: Set<string>): string[] {
  const sourceDirectory = sourcePath.split("/").slice(0, -1).join("/");
  const segments = `${sourceDirectory}/${normalizeRepositoryPath(specifier)}`.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) return [];
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  const joined = resolved.join("/");
  if (!isSafeRepositoryPath(joined)) return [];

  const candidates = [joined];
  if (!/\.[^/]+$/.test(joined)) {
    candidates.push(...SOURCE_EXTENSIONS.map((extension) => `${joined}${extension}`));
    candidates.push(...SOURCE_EXTENSIONS.map((extension) => `${joined}/index${extension}`));
  }
  const matches = [...new Set(candidates)].filter((path) => repositoryPaths.has(path));
  return matches.length === 1 ? matches : [];
}

export function colocatedTests(path: string, repositoryPaths: Set<string>): string[] {
  if (isTestPath(path)) return [];
  const extension = SOURCE_EXTENSIONS.find((item) => path.endsWith(item));
  if (!extension) return [];
  const stem = path.slice(0, -extension.length);
  const basename = stem.split("/").at(-1) ?? stem;
  const directory = stem.split("/").slice(0, -1).join("/");
  const candidates = TEST_SUFFIXES.map((suffix) => `${stem}${suffix}${extension}`);
  candidates.push(
    ...TEST_SUFFIXES.map((suffix) =>
      directory ? `${directory}/__tests__/${basename}${suffix}${extension}` : `__tests__/${basename}${suffix}${extension}`,
    ),
  );
  return [...new Set(candidates)].filter((candidate) => repositoryPaths.has(candidate));
}

function addCandidate(
  candidates: Map<string, Set<RelatedCodeReason>>,
  file: string,
  reason: RelatedCodeReason,
) {
  const reasons = candidates.get(file) ?? new Set<RelatedCodeReason>();
  reasons.add(reason);
  candidates.set(file, reasons);
}

function candidateScore(candidate: RelatedCodeCandidate): number {
  const pathRisk = isTestPath(candidate.file)
    ? 2
    : riskRank({ path: candidate.file, patch: "" });
  const directness = candidate.reasons.includes("direct_import") ? 0 : 1;
  const contract = candidate.reasons.includes("public_contract") ? 0 : 1;
  return pathRisk * 10 + directness * 2 + contract;
}

export function planRelatedCodeContext(params: {
  changedFiles: DiffFile[];
  fullFileContext: FullFileContext[];
  repositoryPaths: string[];
  maxFiles?: number;
  requestBudget?: number;
}): RelatedCodePlan {
  const maxFiles = params.maxFiles ?? RELATED_CODE_CONTEXT_MAX_FILES;
  const requestBudget = params.requestBudget ?? maxFiles;
  if (
    !Number.isInteger(maxFiles) ||
    maxFiles < 0 ||
    !Number.isInteger(requestBudget) ||
    requestBudget < 0
  ) {
    throw new Error("maxFiles and requestBudget must be non-negative integers.");
  }
  const repositoryPaths = new Set(
    params.repositoryPaths
      .map(normalizeRepositoryPath)
      .filter((path) => isSafeRepositoryPath(path) && !isUnsupportedContextPath(path)),
  );
  const changedPaths = new Set(params.changedFiles.map((file) => normalizeRepositoryPath(file.path)));
  const fullContextByPath = new Map(
    params.fullFileContext.map((file) => [normalizeRepositoryPath(file.file), file.content]),
  );
  const candidates = new Map<string, Set<RelatedCodeReason>>();

  for (const changedFile of params.changedFiles) {
    const sourcePath = normalizeRepositoryPath(changedFile.path);
    const source = fullContextByPath.get(sourcePath) ?? changedFile.patch;
    const contract = isPublicContract(source);
    for (const specifier of extractLocalImports(source)) {
      for (const file of resolveImport(sourcePath, specifier, repositoryPaths)) {
        if (!changedPaths.has(file) && !fullContextByPath.has(file)) {
          addCandidate(candidates, file, "direct_import");
          if (contract) addCandidate(candidates, file, "public_contract");
        }
      }
    }
    for (const file of colocatedTests(sourcePath, repositoryPaths)) {
      if (!changedPaths.has(file) && !fullContextByPath.has(file)) {
        addCandidate(candidates, file, "colocated_test");
        if (contract) addCandidate(candidates, file, "public_contract");
      }
    }
  }

  return {
    candidates: [...candidates.entries()]
      .map(([file, reasons]) => ({ file, reasons: [...reasons].sort() }))
      .sort((left, right) => candidateScore(left) - candidateScore(right) || left.file.localeCompare(right.file))
      .slice(0, Math.min(maxFiles, requestBudget)),
  };
}
