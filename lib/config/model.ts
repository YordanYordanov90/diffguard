import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { DEFAULT_MODEL } from "./constants";
import { type Env, parseEnv } from "./env";

export type InstallationModelConfig = {
  model?: string | null;
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function splitModel(model: string): { provider: "anthropic" | "openai"; name: string } {
  const separator = model.indexOf("/");
  const provider = model.slice(0, separator);
  const name = model.slice(separator + 1);

  if ((provider !== "anthropic" && provider !== "openai") || name.length === 0) {
    throw new ConfigurationError(
      `Unsupported model "${model}". Use an anthropic/<model> or openai/<model> identifier.`,
    );
  }

  return { provider, name };
}

export function getModel(
  installation: InstallationModelConfig,
  runtimeEnv: Env = parseEnv(),
): LanguageModel {
  const model = installation.model?.trim() || DEFAULT_MODEL;
  const { provider, name } = splitModel(model);

  if (provider === "openai") {
    if (!runtimeEnv.OPENAI_API_KEY) {
      throw new ConfigurationError("OPENAI_API_KEY is required for the configured OpenAI model.");
    }

    return createOpenAI({ apiKey: runtimeEnv.OPENAI_API_KEY })(name);
  }

  if (!runtimeEnv.ANTHROPIC_API_KEY) {
    throw new ConfigurationError(
      "ANTHROPIC_API_KEY is required for the configured Anthropic model.",
    );
  }

  return createAnthropic({ apiKey: runtimeEnv.ANTHROPIC_API_KEY })(name);
}

export function getRuntimeEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(source);
}
