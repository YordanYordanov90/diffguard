import { describe, expect, it, vi } from "vitest";

import { createGitHubAppAuth } from "@/lib/auth/github-app";
import { decryptSecret, encryptSecret } from "@/lib/auth/token-crypto";

const encryptionKey = Buffer.alloc(32).toString("base64");
const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://diffguard.example.com/api/auth/github/callback",
  encryptionKey,
};

function store(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

describe("OAuth token encryption", () => {
  it("round-trips a token without storing plaintext", () => {
    const encrypted = encryptSecret("github-secret", encryptionKey);

    expect(encrypted.data).not.toContain("github-secret");
    expect(decryptSecret(encrypted, encryptionKey)).toBe("github-secret");
  });
});

describe("GitHub App authorization", () => {
  it("creates a state record and authorization URL", async () => {
    const dependencies = store();
    const auth = createGitHubAppAuth({ config, store: dependencies });
    const state = await auth.createState("user_123", "/dashboard");
    const url = auth.authorizationUrl(state);

    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("state")).toBe(state);
    await expect(auth.consumeState(state)).resolves.toEqual({
      userId: "user_123",
      returnTo: "/dashboard",
    });
    expect(dependencies.delete).toHaveBeenCalledWith(`github:oauth-state:${state}`);
  });

  it("exchanges and stores encrypted app tokens", async () => {
    const dependencies = store();
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "access-secret",
          token_type: "bearer",
          scope: "",
          refresh_token: "refresh-secret",
          expires_in: 3600,
          refresh_token_expires_in: 3600,
        }),
        { status: 200 },
      ),
    );
    const auth = createGitHubAppAuth({ config, store: dependencies, fetcher });

    await auth.authorizeCode("user_123", "auth-code");
    const stored = dependencies.set.mock.calls[0]?.[1] as { accessToken: { data: string } };
    expect(stored.accessToken.data).not.toContain("access-secret");
    await expect(auth.getAccessToken("user_123")).resolves.toBe("access-secret");
    expect(fetcher).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("serializes concurrent refreshes for the same user", async () => {
    let currentTime = 0;
    const dependencies = store();
    let exchangeCount = 0;
    const fetcher = vi.fn(async () => {
      exchangeCount += 1;
      return new Response(
        JSON.stringify({
          access_token: exchangeCount === 1 ? "access-secret" : "refreshed-secret",
          token_type: "bearer",
          scope: "",
          refresh_token: "refresh-secret",
          expires_in: 3600,
          refresh_token_expires_in: 3600,
        }),
        { status: 200 },
      );
    });
    const auth = createGitHubAppAuth({
      config,
      store: dependencies,
      fetcher,
      now: () => currentTime,
    });

    await auth.authorizeCode("user_123", "auth-code");
    currentTime = 3_550_000;
    await expect(Promise.all([
      auth.getAccessToken("user_123"),
      auth.getAccessToken("user_123"),
    ])).resolves.toEqual(["refreshed-secret", "refreshed-secret"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
