import { describe, expect, it } from "vitest";

import {
  ConfigurationError,
  getModel,
} from "@/lib/config/model";
import { DEFAULT_MODEL } from "@/lib/config/constants";
import { parseEnv } from "@/lib/config/env";
import { getEnv } from "@/lib/config/runtime";

const validEnv = {
  DATABASE_URL: "https://example.com/database",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_CLIENT_ID: "Iv1.example",
  GITHUB_APP_CLIENT_SECRET: "github-client-secret",
  GITHUB_APP_SLUG: "diffguard-dev",
  GITHUB_APP_OAUTH_REDIRECT_URI: "https://diffguard.example.com/api/auth/github/callback",
  GITHUB_APP_PRIVATE_KEY_BASE64: "cHJpdmF0ZS1rZXk=",
  GITHUB_WEBHOOK_SECRET: "webhook-secret",
  GITHUB_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  QSTASH_URL: "https://qstash.example.com",
  QSTASH_TOKEN: "qstash-token",
  QSTASH_CURRENT_SIGNING_KEY: "current-signing-key",
  QSTASH_NEXT_SIGNING_KEY: "next-signing-key",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  CLERK_SECRET_KEY: "sk_test_example",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
  OPENAI_API_KEY: "openai-key",
};

describe("environment configuration", () => {
  it("rejects missing required variables", () => {
    expect(() => parseEnv({})).toThrow();
  });

  it("rejects an encryption key with the wrong decoded length", () => {
    expect(() =>
      parseEnv({ ...validEnv, GITHUB_OAUTH_ENCRYPTION_KEY: "not-a-key" }),
    ).toThrow();
  });

  it("accepts the required variables with either provider key omitted", () => {
    const parsed = parseEnv(validEnv);

    expect(parsed.OPENAI_API_KEY).toBe("openai-key");
    expect(parsed.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("parses an explicit source without caching process.env", () => {
    const parsed = getEnv(validEnv as unknown as NodeJS.ProcessEnv);
    expect(parsed.GITHUB_APP_ID).toBe("123456");
  });
});

describe("getModel", () => {
  it("resolves the configured default model", () => {
    const model = getModel({ model: null }, parseEnv(validEnv));

    expect(model.modelId).toBe(DEFAULT_MODEL.slice(DEFAULT_MODEL.indexOf("/") + 1));
  });

  it("fails clearly when a configured provider key is missing", () => {
    expect(() =>
      getModel(
        { model: "anthropic/claude-haiku-4-5" },
        parseEnv(validEnv),
      ),
    ).toThrowError(new ConfigurationError("ANTHROPIC_API_KEY is required for the configured Anthropic model."));
  });
});
