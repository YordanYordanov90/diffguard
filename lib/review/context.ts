import {
  FULL_FILE_CONTEXT_FILE_BYTE_LIMIT,
  FULL_FILE_CONTEXT_FILE_TOKEN_LIMIT,
  FULL_FILE_CONTEXT_MAX_FILES,
} from "@/lib/config/constants";

import { riskRank, type DiffFile } from "./diff";

export type FullFileContextReason =
  | "security_sensitive"
  | "incomplete_hunk"
  | "candidate_finding";

export type FullFileContextCandidate = {
  file: string;
  reasons: FullFileContextReason[];
};

export type FullFileContextSelection = {
  candidates: FullFileContextCandidate[];
};

export type FullFileContext = {
  file: string;
  content: string;
};

export type FullFileContextMissReason =
  | "missing"
  | "unsupported"
  | "oversized"
  | "unavailable"
  | "timeout"
  | "over_budget";

export type FullFileContextMetadata = {
  candidateCount: number;
  fetchedCount: number;
  suppliedBytes: number;
  suppliedTokens: number;
  missReasons: Record<FullFileContextMissReason, number>;
};

const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const BINARY_EXTENSIONS = new Set([
  "7z", "avif", "bmp", "class", "dll", "eot", "exe", "gif", "gz", "ico",
  "jar", "jpeg", "jpg", "mov", "mp3", "mp4", "otf", "pdf", "png", "so",
  "tar", "ttf", "webp", "woff", "woff2", "zip",
]);
const GENERATED_SEGMENTS = new Set([
  "build", "coverage", "dist", ".next", "gen", "generated", "node_modules",
  "third_party", "vendor", "vendors", "bower_components",
]);

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function isSafeContextPath(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !normalized.includes("\0") &&
    !normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  );
}

export function isUnsupportedContextPath(path: string): boolean {
  if (!isSafeContextPath(path)) return true;
  const normalized = normalizePath(path).toLowerCase();
  const segments = normalized.split("/");
  const basename = segments.at(-1) ?? "";
  const extension = basename.includes(".") ? basename.split(".").at(-1) : undefined;
  return (
    LOCKFILES.has(basename) ||
    segments.some((segment) => GENERATED_SEGMENTS.has(segment)) ||
    basename.includes(".min.") ||
    basename.endsWith(".map") ||
    (extension !== undefined && BINARY_EXTENSIONS.has(extension))
  );
}

function hasIncompleteHunk(patch: string): boolean {
  return /^@@[^\n]*@@/m.test(patch);
}

function candidateReasons(
  file: DiffFile,
  candidateFiles: Set<string>,
): FullFileContextReason[] {
  const reasons: FullFileContextReason[] = [];
  if (riskRank(file) === 0) reasons.push("security_sensitive");
  if (hasIncompleteHunk(file.patch)) reasons.push("incomplete_hunk");
  if (candidateFiles.has(normalizePath(file.path))) reasons.push("candidate_finding");
  return reasons;
}

function validateLimit(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}

export function selectFullFileContext(
  files: DiffFile[],
  options: {
    candidateFiles?: string[];
    maxFiles?: number;
  } = {},
): FullFileContextSelection {
  const maxFiles = options.maxFiles ?? FULL_FILE_CONTEXT_MAX_FILES;
  validateLimit("maxFiles", maxFiles);
  const candidateFiles = new Set((options.candidateFiles ?? []).map(normalizePath));
  const candidates = files
    .map((file, index) => ({ file, index, reasons: candidateReasons(file, candidateFiles) }))
    .filter(({ file, reasons }) => reasons.length > 0 && !isUnsupportedContextPath(file.path))
    .sort((left, right) => riskRank(left.file) - riskRank(right.file) || left.index - right.index)
    .slice(0, maxFiles)
    .map(({ file, reasons }) => ({ file: normalizePath(file.path), reasons }));

  return { candidates };
}

export function estimateContextTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

export function validateFullFileContent(
  content: string,
  limits: {
    maxBytes?: number;
    maxTokens?: number;
  } = {},
): { ok: true; bytes: number; tokens: number } | { ok: false; reason: "unsupported" | "oversized" } {
  const maxBytes = limits.maxBytes ?? FULL_FILE_CONTEXT_FILE_BYTE_LIMIT;
  const maxTokens = limits.maxTokens ?? FULL_FILE_CONTEXT_FILE_TOKEN_LIMIT;
  const bytes = new TextEncoder().encode(content).byteLength;
  const tokens = estimateContextTokens(content);
  if (content.includes("\0")) return { ok: false, reason: "unsupported" };
  if (bytes > maxBytes || tokens > maxTokens) return { ok: false, reason: "oversized" };
  return { ok: true, bytes, tokens };
}

export function createFullFileContextMetadata(candidateCount: number): FullFileContextMetadata {
  return {
    candidateCount,
    fetchedCount: 0,
    suppliedBytes: 0,
    suppliedTokens: 0,
    missReasons: {
      missing: 0,
      unsupported: 0,
      oversized: 0,
      unavailable: 0,
      timeout: 0,
      over_budget: 0,
    },
  };
}
