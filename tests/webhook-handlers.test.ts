import { describe, expect, it, vi } from "vitest";

import {
  handleInstallation,
  handleInstallationRepos,
} from "@/lib/github/webhook-handlers";

const queries = vi.hoisted(() => ({
  deleteInstallation: vi.fn(),
  suspendInstallation: vi.fn(),
  syncRepositories: vi.fn(),
  upsertInstallation: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => queries);

describe("installation webhook handlers", () => {
  it("creates an installation and syncs its repositories", async () => {
    await handleInstallation(
      {
        action: "created",
        installation: { id: 42, account: { login: "owner", type: "Organization" } },
        repositories: [{ id: 100, full_name: "owner/repo" }],
      },
    );

    expect(queries.upsertInstallation).toHaveBeenCalledWith({
      id: 42,
      accountLogin: "owner",
      accountType: "Organization",
    });
    expect(queries.syncRepositories).toHaveBeenCalledWith(
      42,
      [{ id: 100, fullName: "owner/repo" }],
      [],
    );
  });

  it("handles deletion and suspension state changes", async () => {
    await handleInstallation(
      {
        action: "deleted",
        installation: { id: 42, account: { login: "owner", type: "User" } },
      },
    );
    await handleInstallation(
      {
        action: "suspend",
        installation: { id: 42, account: { login: "owner", type: "User" } },
      },
    );
    await handleInstallation(
      {
        action: "unsuspend",
        installation: { id: 42, account: { login: "owner", type: "User" } },
      },
    );

    expect(queries.deleteInstallation).toHaveBeenCalledWith(42);
    expect(queries.suspendInstallation).toHaveBeenNthCalledWith(1, 42, true);
    expect(queries.suspendInstallation).toHaveBeenNthCalledWith(2, 42, false);
  });

  it("syncs added and removed repositories", async () => {
    await handleInstallationRepos(
      {
        action: "removed",
        installation: { id: 42 },
        repositories_added: [{ id: 101, full_name: "owner/new-repo" }],
        repositories_removed: [{ id: 100, full_name: "owner/old-repo" }],
      },
    );

    expect(queries.syncRepositories).toHaveBeenCalledWith(
      42,
      [{ id: 101, fullName: "owner/new-repo" }],
      [{ id: 100, fullName: "owner/old-repo" }],
    );
  });
});
