import { DIFF_TOKEN_BUDGET } from "@/lib/config/constants";

export type DiffFile = {
  path: string;
  patch: string;
};

export type ProcessedDiff = {
  files: DiffFile[];
  diff: string;
  fileTree: string[];
  skippedFiles: string[];
  tokenEstimate: number;
};

const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const BINARY_EXTENSIONS = new Set([
  "7z", "avif", "bmp", "class", "dll", "eot", "exe", "gif", "gz", "ico",
  "jar", "jpeg", "jpg", "mov", "mp3", "mp4", "otf", "pdf", "png", "so",
  "tar", "ttf", "webp", "woff", "woff2", "zip",
]);

const RISK_SEGMENTS = ["auth", "middleware", "api", "db", "config"];
const TEST_SEGMENTS = ["test", "tests", "spec", "__tests__", "__mocks__"];
const DOC_EXTENSIONS = new Set(["md", "mdx", "rst", "txt"]);

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^([ab])\//, "");
}

function pathFromHeader(line: string): string | null {
  const value = line.slice(4).trim();
  if (!value || value === "/dev/null") return null;
  return normalizePath(value.split("\t", 1)[0].replace(/^([ab])\//, ""));
}

function parseFilePath(header: string, plusHeader: string | undefined): string | null {
  const plusPath = plusHeader ? pathFromHeader(plusHeader) : null;
  if (plusPath) return plusPath;
  const match = header.match(/^diff --git a\/(.+) b\/(.+)$/);
  return match ? normalizePath(match[2]) : null;
}

function splitDiff(rawDiff: string): DiffFile[] {
  const lines = rawDiff.split("\n");
  const chunks: DiffFile[] = [];
  let start = -1;

  const flush = (end: number) => {
    if (start < 0) return;
    const chunk = lines.slice(start, end).join("\n");
    const header = lines[start];
    const plusHeader = lines.slice(start, end).find((line) => line.startsWith("+++ "));
    const path = parseFilePath(header, plusHeader);
    if (path) chunks.push({ path, patch: chunk });
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("diff --git ")) {
      flush(index);
      start = index;
    }
  }
  flush(lines.length);
  return chunks;
}

function isExcluded(file: DiffFile): boolean {
  const path = file.path.toLowerCase();
  const segments = path.split("/");
  const basename = segments.at(-1) ?? "";
  const extension = basename.includes(".") ? basename.split(".").at(-1) : "";

  return (
    LOCKFILES.has(basename) ||
    segments.some((segment) => ["dist", "build", ".next", "vendor", "vendors", "node_modules", "bower_components", "third_party"].includes(segment)) ||
    basename.includes(".min.") ||
    (extension !== undefined && BINARY_EXTENSIONS.has(extension)) ||
    file.patch.includes("\nBinary files ") ||
    file.patch.includes("\nGIT binary patch")
  );
}

function riskRank(file: DiffFile): number {
  const path = file.path.toLowerCase();
  const segments = path.split("/");
  const basename = segments.at(-1) ?? "";
  const basenameWithoutExtension = basename.split(".")[0];
  if (
    RISK_SEGMENTS.some(
      (segment) =>
        segments.includes(segment) ||
        path.includes(`/${segment}.`) ||
        basenameWithoutExtension === segment,
    )
  ) return 0;
  if (TEST_SEGMENTS.some((segment) => segments.includes(segment))) return 2;
  const extension = segments.at(-1)?.split(".").at(-1) ?? "";
  if (DOC_EXTENSIONS.has(extension)) return 3;
  if (segments.includes("src") || /\.(c|cjs|cpp|css|go|java|js|jsx|py|rb|rs|sql|swift|ts|tsx)$/.test(path)) return 1;
  return 1;
}

export function processDiff(
  rawDiff: string,
  tokenBudget: number = DIFF_TOKEN_BUDGET,
): ProcessedDiff {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 0) {
    throw new Error("tokenBudget must be a non-negative integer.");
  }

  const rankedFiles = splitDiff(rawDiff)
    .filter((file) => !isExcluded(file))
    .map((file, index) => ({ file, index }))
    .sort((left, right) => riskRank(left.file) - riskRank(right.file) || left.index - right.index);

  const files: DiffFile[] = [];
  const skippedFiles: string[] = [];
  let tokenEstimate = 0;

  for (const { file } of rankedFiles) {
    const fileTokens = estimateTokens(file.patch);
    if (tokenEstimate + fileTokens <= tokenBudget) {
      files.push(file);
      tokenEstimate += fileTokens;
    } else {
      skippedFiles.push(file.path);
    }
  }

  return {
    files,
    diff: files.map((file) => file.patch).join("\n"),
    fileTree: files.map((file) => file.path),
    skippedFiles,
    tokenEstimate,
  };
}
