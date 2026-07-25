import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { redirect } from "next/navigation";
import { z } from "zod";

import { githubAppAuth } from "./github-app";
import {
  accessibleInstallationsSchema,
  type AccessibleInstallation,
} from "@/lib/github/accessible-installation";
import { getUserInstallations } from "@/lib/github/client";

const CACHE_TTL_SECONDS = 300;

/** Dashboard access only needs Redis for the installation cache — not App secrets. */
const dashboardCacheEnvSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
});

type Cache = {
  get: (key: string) => Promise<unknown>;
  set: (
    key: string,
    value: AccessibleInstallation[],
    options: { ex: number },
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

export type ResolveInstallationsOptions = {
  /** Skip the short-lived cache and force a GitHub round-trip. */
  bypassCache?: boolean;
};

export class GitHubAuthorizationRequiredError extends Error {
  constructor() {
    super("GitHub authorization is required.");
    this.name = "GitHubAuthorizationRequiredError";
  }
}

export type DashboardAccess =
  | { status: "github-authorization-required" }
  | {
      status: "ready";
      installations: AccessibleInstallation[];
      installationIds: number[];
    };

export type AccessibleInstallationDependencies = {
  getGithubToken: (userId: string) => Promise<string | null>;
  getUserInstallations: (token: string) => Promise<AccessibleInstallation[]>;
  revokeGithubToken: (userId: string) => Promise<void>;
  cache: Cache;
};

export type { AccessibleInstallation };

function isGithubAuthenticationFailure(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }
  return error.status === 401;
}

function cacheKey(userId: string) {
  return `dashboard:installations:${userId}`;
}

function toAccess(installations: AccessibleInstallation[]): Extract<
  DashboardAccess,
  { status: "ready" }
> {
  return {
    status: "ready",
    installations,
    installationIds: installations.map((installation) => installation.id),
  };
}

export async function resolveAccessibleInstallations(
  userId: string,
  dependencies: AccessibleInstallationDependencies,
  options: ResolveInstallationsOptions = {},
): Promise<AccessibleInstallation[]> {
  if (!options.bypassCache) {
    const cached = accessibleInstallationsSchema.safeParse(
      await dependencies.cache.get(cacheKey(userId)),
    );
    if (cached.success) return cached.data;
  }

  const token = await dependencies.getGithubToken(userId);
  if (!token) return [];

  let installations: AccessibleInstallation[];
  try {
    installations = accessibleInstallationsSchema.parse(
      await dependencies.getUserInstallations(token),
    );
  } catch (error) {
    if (!isGithubAuthenticationFailure(error)) throw error;
    await dependencies.revokeGithubToken(userId);
    throw new GitHubAuthorizationRequiredError();
  }
  await dependencies.cache.set(cacheKey(userId), installations, {
    ex: CACHE_TTL_SECONDS,
  });
  return installations;
}

/** Drop the short-lived installation descriptor cache for a Clerk user. */
export async function invalidateInstallationAccessCache(
  userId: string,
  cache?: Pick<Cache, "del">,
) {
  const target =
    cache ?? (defaultDependencies ??= createDefaultDependencies()).cache;
  await target.del(cacheKey(userId));
}

function createDefaultDependencies(): AccessibleInstallationDependencies {
  const env = dashboardCacheEnvSchema.parse({
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return {
    getGithubToken: (userId: string) => githubAppAuth().getAccessToken(userId),
    getUserInstallations,
    revokeGithubToken: (userId: string) => githubAppAuth().revoke(userId),
    cache: {
      get: (key) => redis.get(key),
      set: (key, value, options) => redis.set(key, value, options),
      del: (key) => redis.del(key),
    },
  };
}

let defaultDependencies: AccessibleInstallationDependencies | undefined;

export async function getAccessibleInstallations(
  options: ResolveInstallationsOptions = {},
) {
  const { userId } = await auth();
  if (!userId) return [];
  defaultDependencies ??= createDefaultDependencies();
  return resolveAccessibleInstallations(userId, defaultDependencies, options);
}

export async function getDashboardAccess(
  options: ResolveInstallationsOptions = {},
): Promise<DashboardAccess> {
  await auth.protect();
  const { userId } = await auth();
  if (!userId) return { status: "github-authorization-required" };

  const dependencies = (defaultDependencies ??= createDefaultDependencies());
  const token = await dependencies.getGithubToken(userId);
  if (!token) return { status: "github-authorization-required" };

  try {
    const installations = await resolveAccessibleInstallations(
      userId,
      {
        ...dependencies,
        getGithubToken: async () => token,
      },
      options,
    );
    return toAccess(installations);
  } catch (error) {
    if (error instanceof GitHubAuthorizationRequiredError) {
      return { status: "github-authorization-required" };
    }
    throw error;
  }
}

export async function requireDashboardInstallations() {
  const access = await getDashboardAccess();
  if (access.status === "github-authorization-required") {
    redirect("/api/auth/github/start?returnTo=%2Fdashboard");
  }
  return access.installationIds;
}
