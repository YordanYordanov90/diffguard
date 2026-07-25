import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { redirect } from "next/navigation";
import { z } from "zod";

import { githubAppAuth } from "./github-app";
import { getUserInstallations } from "@/lib/github/client";

const CACHE_TTL_SECONDS = 300;
const installationIdsSchema = z.array(z.number().int().positive());

/** Dashboard access only needs Redis for the installation cache — not App secrets. */
const dashboardCacheEnvSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
});

type Cache = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: number[], options: { ex: number }) => Promise<unknown>;
};

export type AccessibleInstallationDependencies = {
  getGithubToken: (userId: string) => Promise<string | null>;
  getUserInstallations: (token: string) => Promise<number[]>;
  cache: Cache;
};

function cacheKey(userId: string) {
  return `dashboard:installations:${userId}`;
}

export async function resolveAccessibleInstallations(
  userId: string,
  dependencies: AccessibleInstallationDependencies,
) {
  const cached = installationIdsSchema.safeParse(
    await dependencies.cache.get(cacheKey(userId)),
  );
  if (cached.success) return cached.data;

  const token = await dependencies.getGithubToken(userId);
  if (!token) return [];

  const installationIds = installationIdsSchema.parse(
    await dependencies.getUserInstallations(token),
  );
  await dependencies.cache.set(cacheKey(userId), installationIds, {
    ex: CACHE_TTL_SECONDS,
  });
  return installationIds;
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
    cache: {
      get: (key) => redis.get(key),
      set: (key, value, options) => redis.set(key, value, options),
    },
  };
}

let defaultDependencies: AccessibleInstallationDependencies | undefined;

export async function getAccessibleInstallations() {
  const { userId } = await auth();
  if (!userId) return [];
  defaultDependencies ??= createDefaultDependencies();
  return resolveAccessibleInstallations(userId, defaultDependencies);
}

export async function requireDashboardInstallations() {
  await auth.protect();
  const { userId } = await auth();
  if (!userId) return [];

  const dependencies = defaultDependencies ??= createDefaultDependencies();
  const token = await dependencies.getGithubToken(userId);
  if (!token) {
    redirect("/api/auth/github/start?returnTo=%2Fdashboard");
  }

  return resolveAccessibleInstallations(userId, {
    ...dependencies,
    getGithubToken: async () => token,
  });
}
