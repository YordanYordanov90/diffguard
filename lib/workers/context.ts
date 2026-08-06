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
import type { RelatedCodeCandidate } from "@/lib/review/related-context";
import type {
  TargetedEvidenceCandidate,
  TargetedEvidenceCategory,
} from "@/lib/review/targeted-evidence";

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
  requestCount: number;
};

export type RelatedCodeContext = FullFileContext & { reason: string };

export type RetrievedRelatedCodeContext = {
  files: RelatedCodeContext[];
  metadata: FullFileContextMetadata;
  requestCount: number;
};

export type TargetedEvidenceContext = FullFileContext & {
  reason: string;
  candidateIds: string[];
  reasons: TargetedEvidenceCategory[];
};

export type RetrievedTargetedEvidenceContext = {
  files: TargetedEvidenceContext[];
  metadata: FullFileContextMetadata;
  requestCount: number;
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

type ContextCandidate = { file: string };

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

async function retrieveContextCandidates(params: {
  installationId: number;
  repoFullName: string;
  headSha: string;
  candidates: ContextCandidate[];
  fetchRepositoryFile: FetchRepositoryFile;
  totalByteBudget?: number;
  totalTokenBudget?: number;
  deadline?: number;
}): Promise<RetrievedFullFileContext> {
  const metadata = createFullFileContextMetadata(params.candidates.length);
  const context: FullFileContext[] = [];
  let requestCount = 0;
  const deadline = params.deadline ?? Date.now() + FULL_FILE_CONTEXT_TIMEOUT_MS;
  const budget = {
    totalByteLimit: params.totalByteBudget ?? FULL_FILE_CONTEXT_TOTAL_BYTE_LIMIT,
    totalTokenLimit: params.totalTokenBudget ?? FULL_FILE_CONTEXT_TOTAL_TOKEN_LIMIT,
  };

  for (const candidate of params.candidates) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      addMiss(metadata, "timeout");
      continue;
    }
    if (budget.totalByteLimit <= 0 || budget.totalTokenLimit <= 0) {
      addMiss(metadata, "over_budget");
      continue;
    }
    requestCount += 1;
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

  return { files: context, metadata, requestCount };
}

export async function retrieveFullFileContext(params: {
  installationId: number;
  repoFullName: string;
  headSha: string;
  files: DiffFile[];
  fetchRepositoryFile: FetchRepositoryFile;
  totalByteBudget?: number;
  totalTokenBudget?: number;
  deadline?: number;
}): Promise<RetrievedFullFileContext> {
  const selection = selectFullFileContext(params.files);
  return retrieveContextCandidates({
    ...params,
    candidates: selection.candidates,
  });
}

export async function retrieveRelatedCodeContext(params: {
  installationId: number;
  repoFullName: string;
  headSha: string;
  candidates: RelatedCodeCandidate[];
  fetchRepositoryFile: FetchRepositoryFile;
  totalByteBudget?: number;
  totalTokenBudget?: number;
  deadline?: number;
}): Promise<RetrievedRelatedCodeContext> {
  const result = await retrieveContextCandidates({
    ...params,
    candidates: params.candidates.map(({ file }) => ({ file })),
  });
  const reasons = new Map(params.candidates.map((candidate) => [candidate.file, candidate.reasons]));
  return {
    files: result.files.map((file) => ({
      ...file,
      reason: reasons.get(file.file)?.join(", ") ?? "related code",
    })),
    metadata: result.metadata,
    requestCount: result.requestCount,
  };
}

export async function retrieveTargetedEvidenceContext(params: {
  installationId: number;
  repoFullName: string;
  headSha: string;
  candidates: TargetedEvidenceCandidate[];
  suppliedFiles?: string[];
  fetchRepositoryFile: FetchRepositoryFile;
  totalByteBudget?: number;
  totalTokenBudget?: number;
  deadline?: number;
}): Promise<RetrievedTargetedEvidenceContext> {
  const supplied = new Set(params.suppliedFiles ?? []);
  const candidates = params.candidates.filter((candidate) => !supplied.has(candidate.file));
  const result = await retrieveContextCandidates({
    ...params,
    candidates: candidates.map(({ file }) => ({ file })),
  });
  const byFile = new Map(candidates.map((candidate) => [candidate.file, candidate]));
  return {
    files: result.files.map((file) => {
      const candidate = byFile.get(file.file);
      return {
        ...file,
        reason: candidate?.reasons.join(", ") ?? "targeted evidence",
        candidateIds: candidate?.candidateIds ?? [],
        reasons: candidate?.reasons ?? [],
      };
    }),
    metadata: result.metadata,
    requestCount: result.requestCount,
  };
}
