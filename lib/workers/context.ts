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

function canFit(bytes: number, tokens: number, metadata: FullFileContextMetadata) {
  return (
    metadata.suppliedBytes + bytes <= FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT &&
    metadata.suppliedTokens + tokens <= FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT
  );
}

export async function retrieveFullFileContext(params: {
  installationId: number;
  repoFullName: string;
  headSha: string;
  files: DiffFile[];
  fetchRepositoryFile: FetchRepositoryFile;
}): Promise<RetrievedFullFileContext> {
  const selection = selectFullFileContext(params.files);
  const metadata = createFullFileContextMetadata(selection.candidates.length);
  const context: FullFileContext[] = [];
  const deadline = Date.now() + FULL_FILE_CONTEXT_TIMEOUT_MS;

  for (const candidate of selection.candidates) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      addMiss(metadata, "timeout");
      continue;
    }
    let result: RepositoryFileResult | "timeout";
    try {
      result = await fetchCandidate(
        params.fetchRepositoryFile,
        params.installationId,
        params.repoFullName,
        candidate.file,
        params.headSha,
        Math.min(remainingMs, FULL_FILE_CONTEXT_TIMEOUT_MS),
      );
    } catch {
      addMiss(metadata, "unavailable");
      continue;
    }
    if (result === "timeout") {
      addMiss(metadata, "timeout");
      continue;
    }
    if (result.status !== "fetched") {
      addMiss(metadata, result.status);
      continue;
    }
    const validated = validateFullFileContent(result.content, {
      maxBytes: FULL_FILE_CONTEXT_FILE_BYTE_LIMIT,
      maxTokens: FULL_FILE_CONTEXT_FILE_TOKEN_LIMIT,
    });
    if (!validated.ok) {
      addMiss(metadata, validated.reason);
      continue;
    }
    if (!canFit(validated.bytes, validated.tokens, metadata)) {
      addMiss(metadata, "over_budget");
      continue;
    }
    context.push({ file: candidate.file, content: result.content });
    metadata.fetchedCount += 1;
    metadata.suppliedBytes += validated.bytes;
    metadata.suppliedTokens += validated.tokens;
  }

  return { files: context, metadata };
}
