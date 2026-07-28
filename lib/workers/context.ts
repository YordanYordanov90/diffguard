import {
  FULL_FILE_CONTEXT_FILE_BYTE_LIMIT,
  FULL_FILE_CONTEXT_FILE_TOKEN_LIMIT,
  FULL_FILE_CONTEXT_TIMEOUT_MS,
  FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT,
  FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT,
} from "@/lib/config/constants";
import {
  createFullFileContextMetadata,
  selectFullFileContext,
  validateFullFileContent,
  type FullFileContext,
  type FullFileContextMetadata,
  type FullFileContextMissReason,
} from "@/lib/review/context";
import type { DiffFile } from "@/lib/review/diff";
import type { RepositoryFileResult } from "@/lib/github/client";

type FetchRepositoryFile = (
  installationId: number,
  repoFullName: string,
  path: string,
  ref: string,
  maxBytes: number,
  signal?: AbortSignal,
) => Promise<RepositoryFileResult>;

type ContextBudget = {
  totalByteLimit: number;
  totalTokenLimit: number;
};

export type RetrievedFullFileContext = {
  files: FullFileContext[];
  metadata: FullFileContextMetadata;
};

function addMiss(metadata: FullFileContextMetadata, reason: FullFileContextMissReason) {
  metadata.missReasons[reason] += 1;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T | "timeout"> {
  return new Promise<T | "timeout">((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchCandidate(
  fetchRepositoryFile: FetchRepositoryFile,
  installationId: number,
  repoFullName: string,
  path: string,
  headSha: string,
  timeoutMs: number,
) {
  const controller = new AbortController();
  return withTimeout(
    fetchRepositoryFile(
      installationId,
      repoFullName,
      path,
      headSha,
      FULL_FILE_CONTEXT_FILE_BYTE_LIMIT,
      controller.signal,
    ),
    timeoutMs,
    controller,
  );
}

function canFit(
  bytes: number,
  tokens: number,
  metadata: FullFileContextMetadata,
  budget: ContextBudget,
) {
  return (
    metadata.suppliedBytes + bytes <= budget.totalByteLimit &&
    metadata.suppliedTokens + tokens <= budget.totalTokenLimit
  );
}

type CandidateResult =
  | { status: "accepted"; context: FullFileContext; bytes: number; tokens: number }
  | { status: "miss"; reason: FullFileContextMissReason };

async function retrieveCandidate(params: {
  fetchRepositoryFile: FetchRepositoryFile;
  installationId: number;
  repoFullName: string;
  headSha: string;
  path: string;
  timeoutMs: number;
  metadata: FullFileContextMetadata;
  budget: ContextBudget;
}): Promise<CandidateResult> {
  if (params.budget.totalByteLimit <= 0 || params.budget.totalTokenLimit <= 0) {
    return { status: "miss", reason: "over_budget" };
  }
  let result: RepositoryFileResult | "timeout";
  try {
    result = await fetchCandidate(
      params.fetchRepositoryFile,
      params.installationId,
      params.repoFullName,
      params.path,
      params.headSha,
      params.timeoutMs,
    );
  } catch {
    return { status: "miss", reason: "unavailable" };
  }
  if (result === "timeout") return { status: "miss", reason: "timeout" };
  if (result.status !== "fetched") return { status: "miss", reason: result.status };
  const validated = validateFullFileContent(result.content, {
    maxBytes: FULL_FILE_CONTEXT_FILE_BYTE_LIMIT,
    maxTokens: FULL_FILE_CONTEXT_FILE_TOKEN_LIMIT,
  });
  if (!validated.ok) return { status: "miss", reason: validated.reason };
  if (!canFit(validated.bytes, validated.tokens, params.metadata, params.budget)) {
    return { status: "miss", reason: "over_budget" };
  }
  return {
    status: "accepted",
    context: { file: params.path, content: result.content },
    bytes: validated.bytes,
    tokens: validated.tokens,
  };
}

export async function retrieveFullFileContext(params: {
  installationId: number;
  repoFullName: string;
  headSha: string;
  files: DiffFile[];
  fetchRepositoryFile: FetchRepositoryFile;
  totalByteBudget?: number;
  totalTokenBudget?: number;
}): Promise<RetrievedFullFileContext> {
  const selection = selectFullFileContext(params.files);
  const metadata = createFullFileContextMetadata(selection.candidates.length);
  const context: FullFileContext[] = [];
  const deadline = Date.now() + FULL_FILE_CONTEXT_TIMEOUT_MS;
  const budget = {
    totalByteLimit: params.totalByteBudget ?? FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT,
    totalTokenLimit: params.totalTokenBudget ?? FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT,
  };

  for (const candidate of selection.candidates) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      addMiss(metadata, "timeout");
      continue;
    }
    const result = await retrieveCandidate({
      fetchRepositoryFile: params.fetchRepositoryFile,
      installationId: params.installationId,
      repoFullName: params.repoFullName,
      headSha: params.headSha,
      path: candidate.file,
      timeoutMs: Math.min(remainingMs, FULL_FILE_CONTEXT_TIMEOUT_MS),
      metadata,
      budget,
    });
    if (result.status === "miss") {
      addMiss(metadata, result.reason);
      continue;
    }
    context.push(result.context);
    metadata.fetchedCount += 1;
    metadata.suppliedBytes += result.bytes;
    metadata.suppliedTokens += result.tokens;
  }

  return { files: context, metadata };
}
