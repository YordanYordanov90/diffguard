import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { z } from "zod";

import { decryptSecret, encryptSecret } from "./token-crypto";

const STATE_TTL_SECONDS = 600;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180;
const ACCESS_TOKEN_SKEW_MS = 60_000;

const tokenExchangeSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("bearer"),
  scope: z.string(),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});

const storedTokenSchema = z.object({
  accessToken: z.unknown(),
  refreshToken: z.unknown().optional(),
  accessTokenExpiresAt: z.number().int().positive(),
  refreshTokenExpiresAt: z.number().int().positive().optional(),
});

const pendingStateSchema = z.object({
  userId: z.string().min(1),
  returnTo: z.string().refine(
    (value) => value.startsWith("/") && !value.startsWith("//"),
    "Return path must be local to DiffGuard.",
  ),
});

const configSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  encryptionKey: z.string().min(1),
});

export type GitHubAppAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
};

export type GitHubAppAuthStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, options: { ex: number }) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
};

type Fetcher = typeof fetch;

function tokenKey(userId: string) {
  return `github:app-auth:${userId}`;
}

function stateKey(state: string) {
  return `github:oauth-state:${state}`;
}

function configFromEnvironment(): GitHubAppAuthConfig {
  return configSchema.parse({
    clientId: process.env.GITHUB_APP_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? "",
    redirectUri: process.env.GITHUB_APP_OAUTH_REDIRECT_URI ?? "",
    encryptionKey: process.env.GITHUB_OAUTH_ENCRYPTION_KEY ?? "",
  });
}

function storeFromEnvironment(): GitHubAppAuthStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash Redis configuration is required.");
  const redis = new Redis({ url, token });
  return {
    get: (key) => redis.get(key),
    set: (key, value, options) => redis.set(key, value, options),
    delete: (key) => redis.del(key),
  };
}

export function createGitHubAppAuth(input?: {
  config?: GitHubAppAuthConfig;
  store?: GitHubAppAuthStore;
  fetcher?: Fetcher;
  now?: () => number;
}) {
  const config = input?.config ?? configFromEnvironment();
  const store = input?.store ?? storeFromEnvironment();
  const fetcher = input?.fetcher ?? fetch;
  const now = input?.now ?? Date.now;

  async function exchangeToken(body: URLSearchParams) {
    const response = await fetcher("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json" },
      body,
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error("GitHub OAuth token exchange failed.");
    return tokenExchangeSchema.parse(payload);
  }

  async function saveTokens(userId: string, payload: z.infer<typeof tokenExchangeSchema>) {
    // GitHub omits `expires_in` when token expiration is disabled for the App.
    // Do not invent an eight-hour expiry in that case; the Redis TTL still
    // provides a bounded record lifetime for key rotation and cleanup.
    const accessTokenExpiresAt = payload.expires_in
      ? now() + payload.expires_in * 1000
      : Number.MAX_SAFE_INTEGER;
    const refreshTokenExpiresAt = payload.refresh_token_expires_in
      ? now() + payload.refresh_token_expires_in * 1000
      : undefined;
    const stored = {
      accessToken: encryptSecret(payload.access_token, config.encryptionKey),
      ...(payload.refresh_token
        ? { refreshToken: encryptSecret(payload.refresh_token, config.encryptionKey) }
        : {}),
      accessTokenExpiresAt,
      ...(refreshTokenExpiresAt ? { refreshTokenExpiresAt } : {}),
    };
    await store.set(tokenKey(userId), stored, {
      ex: payload.refresh_token_expires_in ?? TOKEN_TTL_SECONDS,
    });
  }

  async function getAccessToken(userId: string): Promise<string | null> {
    const parsed = storedTokenSchema.safeParse(await store.get(tokenKey(userId)));
    if (!parsed.success) {
      await store.delete(tokenKey(userId));
      return null;
    }
    if (parsed.data.accessTokenExpiresAt > now() + ACCESS_TOKEN_SKEW_MS) {
      try {
        return decryptSecret(parsed.data.accessToken, config.encryptionKey);
      } catch {
        await store.delete(tokenKey(userId));
        return null;
      }
    }
    if (!parsed.data.refreshToken) {
      await store.delete(tokenKey(userId));
      return null;
    }
    if (parsed.data.refreshTokenExpiresAt && parsed.data.refreshTokenExpiresAt <= now()) {
      await store.delete(tokenKey(userId));
      return null;
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(parsed.data.refreshToken, config.encryptionKey);
    } catch {
      await store.delete(tokenKey(userId));
      return null;
    }
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    try {
      const refreshed = await exchangeToken(body);
      await saveTokens(userId, {
        ...refreshed,
        refresh_token: refreshed.refresh_token ?? refreshToken,
        refresh_token_expires_in: refreshed.refresh_token_expires_in ??
          (parsed.data.refreshTokenExpiresAt
            ? Math.max(1, Math.floor((parsed.data.refreshTokenExpiresAt - now()) / 1000))
            : undefined),
      });
      return refreshed.access_token;
    } catch {
      await store.delete(tokenKey(userId));
      return null;
    }
  }

  return {
    authorizationUrl(state: string) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("state", state);
      return url;
    },
    async createState(userId: string, returnTo: string) {
      const state = randomBytes(32).toString("base64url");
      await store.set(stateKey(state), { userId, returnTo }, { ex: STATE_TTL_SECONDS });
      return state;
    },
    async consumeState(state: string) {
      const value = pendingStateSchema.safeParse(await store.get(stateKey(state)));
      await store.delete(stateKey(state));
      return value.success ? value.data : null;
    },
    async authorizeCode(userId: string, code: string) {
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      });
      const tokens = await exchangeToken(body);
      await saveTokens(userId, tokens);
    },
    getAccessToken,
    async revoke(userId: string) {
      await store.delete(tokenKey(userId));
    },
  };
}

let defaultAuth: ReturnType<typeof createGitHubAppAuth> | undefined;

export function githubAppAuth() {
  defaultAuth ??= createGitHubAppAuth();
  return defaultAuth;
}
