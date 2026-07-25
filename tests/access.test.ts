import { describe, expect, it, vi } from "vitest";

import { resolveAccessibleInstallations } from "@/lib/auth/access";

function dependencies(cached: unknown = null) {
  return {
    getGithubToken: vi.fn(async () => "github-token"),
    getUserInstallations: vi.fn(async () => [123, 456]),
    cache: {
      get: vi.fn(async () => cached),
      set: vi.fn(async () => undefined),
    },
  };
}

describe("resolveAccessibleInstallations", () => {
  it("returns cached installation ids without requesting a token", async () => {
    const deps = dependencies([789]);

    await expect(resolveAccessibleInstallations("user_1", deps)).resolves.toEqual([789]);
    expect(deps.getGithubToken).not.toHaveBeenCalled();
    expect(deps.getUserInstallations).not.toHaveBeenCalled();
  });

  it("resolves and caches GitHub installations for a signed-in user", async () => {
    const deps = dependencies();

    await expect(resolveAccessibleInstallations("user_1", deps)).resolves.toEqual([123, 456]);
    expect(deps.getGithubToken).toHaveBeenCalledWith("user_1");
    expect(deps.getUserInstallations).toHaveBeenCalledWith("github-token");
    expect(deps.cache.set).toHaveBeenCalledWith(
      "dashboard:installations:user_1",
      [123, 456],
      { ex: 300 },
    );
  });

  it("returns an empty set when GitHub OAuth is unavailable", async () => {
    const deps = dependencies();
    deps.getGithubToken.mockResolvedValue(null);

    await expect(resolveAccessibleInstallations("user_1", deps)).resolves.toEqual([]);
    expect(deps.getUserInstallations).not.toHaveBeenCalled();
    expect(deps.cache.set).not.toHaveBeenCalled();
  });
});
