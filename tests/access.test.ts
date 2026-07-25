import { describe, expect, it, vi } from "vitest";

import {
  GitHubAuthorizationRequiredError,
  invalidateInstallationAccessCache,
  resolveAccessibleInstallations,
} from "@/lib/auth/access";
import type { AccessibleInstallation } from "@/lib/github/accessible-installation";

const sampleInstallations: AccessibleInstallation[] = [
  {
    id: 123,
    account: { login: "acme", type: "Organization" },
    repository_selection: "all",
    html_url: "https://github.com/organizations/acme/settings/installations/123",
    suspended_at: null,
  },
  {
    id: 456,
    account: { login: "owner", type: "User" },
    repository_selection: "selected",
    html_url: "https://github.com/settings/installations/456",
    suspended_at: null,
  },
];

function dependencies(cached: unknown = null) {
  return {
    getGithubToken: vi.fn(async () => "github-token"),
    getUserInstallations: vi.fn(async () => sampleInstallations),
    revokeGithubToken: vi.fn(async () => undefined),
    cache: {
      get: vi.fn(async () => cached),
      set: vi.fn(async () => undefined),
      del: vi.fn(async () => undefined),
    },
  };
}

describe("resolveAccessibleInstallations", () => {
  it("returns cached installation descriptors without requesting a token", async () => {
    const cached = [sampleInstallations[1]];
    const deps = dependencies(cached);

    await expect(resolveAccessibleInstallations("user_1", deps)).resolves.toEqual(
      cached,
    );
    expect(deps.getGithubToken).not.toHaveBeenCalled();
    expect(deps.getUserInstallations).not.toHaveBeenCalled();
  });

  it("resolves and caches GitHub installation descriptors for a signed-in user", async () => {
    const deps = dependencies();

    await expect(resolveAccessibleInstallations("user_1", deps)).resolves.toEqual(
      sampleInstallations,
    );
    expect(deps.getGithubToken).toHaveBeenCalledWith("user_1");
    expect(deps.getUserInstallations).toHaveBeenCalledWith("github-token");
    expect(deps.cache.set).toHaveBeenCalledWith(
      "dashboard:installations:user_1",
      sampleInstallations,
      { ex: 300 },
    );
  });

  it("ignores legacy id-only cache entries and refetches descriptors", async () => {
    const deps = dependencies([789]);

    await expect(resolveAccessibleInstallations("user_1", deps)).resolves.toEqual(
      sampleInstallations,
    );
    expect(deps.getUserInstallations).toHaveBeenCalled();
  });

  it("returns an empty set when GitHub OAuth is unavailable", async () => {
    const deps = dependencies();
    deps.getGithubToken.mockResolvedValue(null);

    await expect(resolveAccessibleInstallations("user_1", deps)).resolves.toEqual([]);
    expect(deps.getUserInstallations).not.toHaveBeenCalled();
    expect(deps.cache.set).not.toHaveBeenCalled();
  });

  it("revokes rejected credentials and asks the caller to reauthorize", async () => {
    const deps = dependencies();
    deps.getUserInstallations.mockRejectedValue({ status: 401 });

    await expect(resolveAccessibleInstallations("user_1", deps)).rejects.toBeInstanceOf(
      GitHubAuthorizationRequiredError,
    );
    expect(deps.revokeGithubToken).toHaveBeenCalledWith("user_1");
  });

  it("bypasses the cache when refresh is requested after Manage on GitHub", async () => {
    const deps = dependencies(sampleInstallations);

    await expect(
      resolveAccessibleInstallations("user_1", deps, { bypassCache: true }),
    ).resolves.toEqual(sampleInstallations);
    expect(deps.cache.get).not.toHaveBeenCalled();
    expect(deps.getUserInstallations).toHaveBeenCalledWith("github-token");
    expect(deps.cache.set).toHaveBeenCalled();
  });

  it("invalidates the installation-access cache key for a user", async () => {
    const deps = dependencies();
    await invalidateInstallationAccessCache("user_1", deps.cache);
    expect(deps.cache.del).toHaveBeenCalledWith("dashboard:installations:user_1");
  });
});
