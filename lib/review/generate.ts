import {
  generateObject,
  JSONParseError,
  NoObjectGeneratedError,
  TypeValidationError,
  type LanguageModel,
} from "ai";
import { z } from "zod";

import {
  ADJUDICATION_OUTPUT_TOKEN_BUDGET,
  CHAT_OUTPUT_TOKEN_BUDGET,
  LLM_TIMEOUT_MS,
  REVIEW_OUTPUT_TOKEN_BUDGET,
  SECURITY_VERIFICATION_OUTPUT_TOKEN_BUDGET,
} from "@/lib/config/constants";
import type { Env } from "@/lib/config/env";
import { getModel, type InstallationModelConfig } from "@/lib/config/model";

import type { ReviewPrompt } from "./prompt";
import {
  adjudicationOutputSchema,
  candidateReviewOutputSchema,
  chatResponseSchema,
  securityVerificationOutputSchema,
  type AdjudicationOutput,
  type CandidateReviewOutput,
  type ChatResponse,
  type SecurityVerificationOutput,
} from "./schema";

type Usage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

type GenerateObjectResult = {
  object: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
};

type GenerateObjectFunction = (options: {
  model: LanguageModel;
  schema: z.ZodType;
  system: string;
  prompt: string;
  abortSignal: AbortSignal;
  maxRetries: number;
  maxOutputTokens?: number;
}) => Promise<GenerateObjectResult>;

export type StructuredGenerationOptions = {
  model?: LanguageModel;
  runtimeEnv?: Env;
  timeoutMs?: number;
  deadline?: number;
  generateObjectFn?: GenerateObjectFunction;
};

export type GeneratedReview = {
  output: CandidateReviewOutput;
  usage: Usage;
  durationMs: number;
};

export type GeneratedAdjudication = {
  output: AdjudicationOutput;
  usage: Usage;
  durationMs: number;
};

export type GeneratedSecurityVerification = {
  output: SecurityVerificationOutput;
  usage: Usage;
  durationMs: number;
};

export class ReviewFailedError extends Error {
  readonly cause: unknown;
  readonly retryable: boolean;
  readonly timedOut: boolean;

  constructor(
    message = "The review could not be generated.",
    cause?: unknown,
    retryable = true,
    timedOut = false,
  ) {
    super(message);
    this.name = "ReviewFailedError";
    this.cause = cause;
    this.retryable = retryable;
    this.timedOut = timedOut;
  }
}

function numericUsage(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addUsage(total: Usage, result: GenerateObjectResult): void {
  total.inputTokens = (total.inputTokens ?? 0) + numericUsage(result.usage?.inputTokens);
  total.outputTokens = (total.outputTokens ?? 0) + numericUsage(result.usage?.outputTokens);
}

function usageFromError(error: unknown): Usage {
  if (NoObjectGeneratedError.isInstance(error)) {
    return {
      inputTokens: error.usage?.inputTokens ?? null,
      outputTokens: error.usage?.outputTokens ?? null,
    };
  }

  return { inputTokens: null, outputTokens: null };
}

function isValidationFailure(error: unknown): boolean {
  if (
    NoObjectGeneratedError.isInstance(error) ||
    JSONParseError.isInstance(error) ||
    TypeValidationError.isInstance(error)
  ) {
    return true;
  }

  return error instanceof Error && /invalid|parse|schema|validation|object/i.test(error.message);
}

function errorFeedback(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message.slice(0, 2_000);
  }

  return "The previous response could not be parsed or validated.";
}

async function withTimeout<T>(
  operation: Promise<T>,
  controller: AbortController,
  deadline: number,
): Promise<T> {
  const timeoutMs = Math.max(0, deadline - Date.now());
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ReviewFailedError("The review generation timed out.", undefined, true, true));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function generateStructured<T>(
  prompt: ReviewPrompt,
  installation: InstallationModelConfig,
  schema: z.ZodType<T>,
  options: StructuredGenerationOptions,
  maxOutputTokens?: number,
): Promise<{ output: T; usage: Usage; durationMs: number }> {
  const model = options.model ?? getModel(installation, options.runtimeEnv);
  const generate = options.generateObjectFn ?? (generateObject as unknown as GenerateObjectFunction);
  const controller = new AbortController();
  const startedAt = Date.now();
  const deadline = options.deadline ?? startedAt + (options.timeoutMs ?? LLM_TIMEOUT_MS);
  const usage: Usage = { inputTokens: null, outputTokens: null };
  let userPrompt = prompt.user;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await withTimeout(
          generate({
            model,
            schema,
            system: prompt.system,
            prompt: userPrompt,
            abortSignal: controller.signal,
            maxRetries: 0,
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
          }),
          controller,
          deadline,
        );
        addUsage(usage, result);
        return {
          output: result.object as T,
          usage,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        const failedUsage = usageFromError(error);
        usage.inputTokens = (usage.inputTokens ?? 0) + (failedUsage.inputTokens ?? 0);
        usage.outputTokens = (usage.outputTokens ?? 0) + (failedUsage.outputTokens ?? 0);

        if (controller.signal.aborted || error instanceof ReviewFailedError) throw error;
        if (attempt === 0 && isValidationFailure(error)) {
          userPrompt = `${prompt.user}\n\n<validation-feedback>\n${errorFeedback(error)}\n</validation-feedback>`;
          continue;
        }

        throw new ReviewFailedError(undefined, error, attempt > 0 ? false : true);
      }
    }
  } catch (error) {
    if (error instanceof ReviewFailedError) throw error;
    throw new ReviewFailedError(undefined, error);
  }

  throw new ReviewFailedError();
}

export async function generateReview(
  prompt: ReviewPrompt,
  installation: InstallationModelConfig,
  options: StructuredGenerationOptions = {},
): Promise<GeneratedReview> {
  return generateStructured(
    prompt,
    installation,
    candidateReviewOutputSchema,
    options,
    REVIEW_OUTPUT_TOKEN_BUDGET,
  );
}

export async function adjudicateReview(
  prompt: ReviewPrompt,
  installation: InstallationModelConfig,
  options: StructuredGenerationOptions = {},
): Promise<GeneratedAdjudication> {
  return generateStructured(
    prompt,
    installation,
    adjudicationOutputSchema,
    options,
    ADJUDICATION_OUTPUT_TOKEN_BUDGET,
  );
}

export async function verifySecurityFindings(
  prompt: ReviewPrompt,
  installation: InstallationModelConfig,
  options: StructuredGenerationOptions = {},
): Promise<GeneratedSecurityVerification> {
  return generateStructured(
    prompt,
    installation,
    securityVerificationOutputSchema,
    options,
    SECURITY_VERIFICATION_OUTPUT_TOKEN_BUDGET,
  );
}

export type GeneratedChat = {
  output: ChatResponse;
  usage: Usage;
  durationMs: number;
};

/**
 * PR-scoped chat generation (Feature 34). Cost is tracked on pr_interactions
 * and never counted toward the automatic review daily cap.
 */
export async function generateChat(
  prompt: ReviewPrompt,
  installation: InstallationModelConfig,
  options: StructuredGenerationOptions = {},
): Promise<GeneratedChat> {
  return generateStructured(
    prompt,
    installation,
    chatResponseSchema,
    options,
    CHAT_OUTPUT_TOKEN_BUDGET,
  );
}
