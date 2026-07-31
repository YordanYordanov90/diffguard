import { createHash } from "node:crypto";

import {
  LEARNING_GUIDANCE_MAX_CHARS,
  LEARNINGS_PROMPT_TOKEN_CAP,
  MAX_ACTIVE_LEARNINGS_PER_REPO,
} from "@/lib/config/constants";
import { estimateContextTokens } from "./context";

export type RepositoryLearningPromptItem = {
  id: string;
  guidance: string;
};

/** Normalize guidance for duplicate detection (trusted pure code). */
export function normalizeLearningGuidance(guidance: string): string {
  return guidance.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * One-way content hash for repository-scoped duplicate detection.
 * Never stores reversible source fragments.
 */
export function computeLearningContentHash(guidance: string): string {
  return createHash("sha256")
    .update(normalizeLearningGuidance(guidance), "utf8")
    .digest("hex");
}

/**
 * Revalidate a learning row every time it is loaded for the prompt.
 * Cross-tenant filtering is the caller's responsibility.
 */
export function isValidActiveLearning(learning: {
  id: string;
  guidance: string;
  status: string;
}): learning is { id: string; guidance: string; status: "active" } {
  if (learning.status !== "active") return false;
  if (typeof learning.id !== "string" || learning.id.length === 0) return false;
  const guidance = learning.guidance.trim();
  if (!guidance || guidance.length > LEARNING_GUIDANCE_MAX_CHARS) return false;
  return true;
}

/**
 * Select active learnings for the prompt under a token budget.
 * Preserves insertion order; drops trailing items when over budget.
 */
export function selectLearningsForPrompt(
  learnings: RepositoryLearningPromptItem[],
  tokenBudget: number = LEARNINGS_PROMPT_TOKEN_CAP,
  maxCount: number = MAX_ACTIVE_LEARNINGS_PER_REPO,
): RepositoryLearningPromptItem[] {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 0) {
    throw new Error("tokenBudget must be a non-negative integer.");
  }
  if (!Number.isInteger(maxCount) || maxCount < 0) {
    throw new Error("maxCount must be a non-negative integer.");
  }

  const selected: RepositoryLearningPromptItem[] = [];
  for (const learning of learnings) {
    if (selected.length >= maxCount) break;
    if (!isValidActiveLearning({ ...learning, status: "active" })) continue;

    const candidate = {
      id: learning.id,
      guidance: learning.guidance.trim(),
    };
    const next = [...selected, candidate];
    if (estimateLearningsTokens(next) > tokenBudget) break;
    selected.push(candidate);
  }
  return selected;
}

export function estimateLearningsTokens(
  learnings: RepositoryLearningPromptItem[],
): number {
  if (learnings.length === 0) return 0;
  return estimateContextTokens(
    learnings.map((item) => `${item.id}\n${item.guidance}`).join("\n"),
  );
}

export function formatLearningsForPrompt(
  learnings: RepositoryLearningPromptItem[],
): string {
  if (learnings.length === 0) return "(none)";
  return learnings
    .map((item) => JSON.stringify({ id: item.id, guidance: item.guidance }))
    .join("\n");
}
