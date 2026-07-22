import { describe, expect, it, vi } from "vitest";

import { generateReview, ReviewFailedError } from "@/lib/review/generate";
import type { ReviewPrompt } from "@/lib/review/prompt";

const prompt: ReviewPrompt = { system: "system", user: "untrusted diff" };
const output = { summary: "Looks good.", verdict: "approve" as const, findings: [] };
const model = { modelId: "test-model" } as never;

describe("generateReview", () => {
  it("returns validated output and usage", async () => {
    const generateObjectFn = vi.fn().mockResolvedValue({
      object: output,
      usage: { inputTokens: 12, outputTokens: 4 },
    });

    await expect(
      generateReview(prompt, { model: "openai/test" }, { model, generateObjectFn }),
    ).resolves.toMatchObject({ output, usage: { inputTokens: 12, outputTokens: 4 } });
    expect(generateObjectFn).toHaveBeenCalledOnce();
  });

  it("retries a validation failure with feedback", async () => {
    const generateObjectFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("schema validation failed"))
      .mockResolvedValueOnce({ object: output, usage: { inputTokens: 8, outputTokens: 3 } });

    await expect(
      generateReview(prompt, { model: "openai/test" }, { model, generateObjectFn }),
    ).resolves.toMatchObject({ output });
    expect(generateObjectFn).toHaveBeenCalledTimes(2);
    expect(generateObjectFn.mock.calls[1][0].prompt).toContain("schema validation failed");
  });

  it("throws a typed error after the retry fails", async () => {
    const generateObjectFn = vi.fn().mockRejectedValue(new Error("schema validation failed"));

    await expect(
      generateReview(prompt, { model: "openai/test" }, { model, generateObjectFn }),
    ).rejects.toBeInstanceOf(ReviewFailedError);
    expect(generateObjectFn).toHaveBeenCalledTimes(2);
  });

  it("aborts and fails on timeout", async () => {
    let signal: AbortSignal | undefined;
    const generateObjectFn = vi.fn(({ abortSignal }: { abortSignal: AbortSignal }) => {
      signal = abortSignal;
      return new Promise(() => undefined);
    });

    await expect(
      generateReview(prompt, { model: "openai/test" }, { model, generateObjectFn, timeoutMs: 1 }),
    ).rejects.toMatchObject({ name: "ReviewFailedError" });
    expect(signal?.aborted).toBe(true);
  });
});
