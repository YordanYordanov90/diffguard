import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

const queries = vi.hoisted(() => ({
  getRepositoryLearningByIdForInstallations: vi.fn(),
  updateRepositoryLearningGuidance: vi.fn(),
  archiveRepositoryLearning: vi.fn(),
  reactivateRepositoryLearning: vi.fn(),
  listRepositoryLearningsByInstallations: vi.fn(),
}));

const access = vi.hoisted(() => ({
  getDashboardAccess: vi.fn(),
}));

const identity = vi.hoisted(() => ({
  getSignedInGitHubLogin: vi.fn(),
}));

const github = vi.hoisted(() => ({
  getCollaboratorPermission: vi.fn(),
}));

const clerk = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => queries);
vi.mock("@/lib/auth/access", () => access);
vi.mock("@/lib/auth/github-identity", () => identity);
vi.mock("@/lib/github/client", () => github);
vi.mock("@clerk/nextjs/server", () => ({
  auth: clerk.auth,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  archiveRepositoryLearningAction,
  editRepositoryLearningAction,
  reactivateRepositoryLearningAction,
} from "@/lib/dashboard/learning-actions";
import { filterDashboardLearnings } from "@/lib/dashboard/learnings";
import type { DashboardLearning } from "@/lib/dashboard/learnings";

const sampleLearning = {
  id: "11111111-1111-4111-8111-111111111111",
  installationId: 42,
  repositoryId: 100,
  repositoryFullName: "owner/repo",
  guidance: "Prefer explicit tenant checks.",
  status: "active" as const,
  contentHash: "abc",
};

function baseDashboardLearning(
  overrides: Partial<DashboardLearning> = {},
): DashboardLearning {
  return {
    id: sampleLearning.id,
    installationId: 42,
    repositoryId: 100,
    repositoryFullName: "owner/repo",
    guidance: "Prefer explicit tenant checks.",
    status: "active",
    createdBy: "maintainer",
    sourceFindingId: null,
    sourceCommentId: null,
    sourcePrNumber: 7,
    usageCount: 2,
    lastUsedAt: null,
    archivedAt: null,
    lastModifiedBy: null,
    lastModifiedAt: null,
    lastAction: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clerk.auth.mockResolvedValue({ userId: "user_1" });
  access.getDashboardAccess.mockResolvedValue({
    status: "ready",
    installations: [],
    installationIds: [42],
  });
  queries.getRepositoryLearningByIdForInstallations.mockResolvedValue(
    sampleLearning,
  );
  identity.getSignedInGitHubLogin.mockResolvedValue("maintainer");
  github.getCollaboratorPermission.mockResolvedValue("write");
});

describe("filterDashboardLearnings", () => {
  it("filters by repository, status, and free-text query", () => {
    const rows = [
      baseDashboardLearning(),
      baseDashboardLearning({
        id: "22222222-2222-4222-8222-222222222222",
        repositoryFullName: "owner/other",
        status: "archived",
        guidance: "Skip verbose logging in tests.",
        createdBy: "alice",
      }),
    ];

    expect(
      filterDashboardLearnings(rows, { repository: "owner/other" }).map(
        (row) => row.id,
      ),
    ).toEqual(["22222222-2222-4222-8222-222222222222"]);

    expect(
      filterDashboardLearnings(rows, { status: "archived" }).map((row) => row.id),
    ).toEqual(["22222222-2222-4222-8222-222222222222"]);

    expect(
      filterDashboardLearnings(rows, { query: "tenant" }).map((row) => row.id),
    ).toEqual([sampleLearning.id]);
  });
});

describe("learning governance actions", () => {
  it("rejects unauthenticated callers", async () => {
    clerk.auth.mockResolvedValueOnce({ userId: null });

    await expect(
      editRepositoryLearningAction({
        learningId: sampleLearning.id,
        guidance: "Prefer REST.",
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      error: "Unauthorized",
    });
  });

  it("rejects cross-tenant learning ids", async () => {
    queries.getRepositoryLearningByIdForInstallations.mockResolvedValueOnce(
      null,
    );

    await expect(
      archiveRepositoryLearningAction({ learningId: sampleLearning.id }),
    ).resolves.toEqual({
      success: false,
      data: null,
      error: "Learning not found.",
    });
    expect(queries.archiveRepositoryLearning).not.toHaveBeenCalled();
  });

  it("rejects insufficient GitHub repository permission", async () => {
    github.getCollaboratorPermission.mockResolvedValueOnce("read");

    await expect(
      editRepositoryLearningAction({
        learningId: sampleLearning.id,
        guidance: "Prefer REST.",
      }),
    ).resolves.toEqual({
      success: false,
      data: null,
      error: "You need write access on this repository to change learnings.",
    });
    expect(queries.updateRepositoryLearningGuidance).not.toHaveBeenCalled();
  });

  it("edits guidance when authorized", async () => {
    queries.updateRepositoryLearningGuidance.mockResolvedValueOnce({
      status: "updated",
      learning: sampleLearning,
    });

    await expect(
      editRepositoryLearningAction({
        learningId: sampleLearning.id,
        guidance: "  Prefer REST over RPC.  ",
      }),
    ).resolves.toEqual({ success: true, data: null, error: null });

    expect(queries.updateRepositoryLearningGuidance).toHaveBeenCalledWith(
      42,
      100,
      sampleLearning.id,
      "  Prefer REST over RPC.  ",
      "maintainer",
    );
  });

  it("rejects invalid guidance length", async () => {
    await expect(
      editRepositoryLearningAction({
        learningId: sampleLearning.id,
        guidance: "",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "Enter a preference up to 500 characters.",
    });
  });

  it("archives and reactivates with write permission", async () => {
    queries.archiveRepositoryLearning.mockResolvedValueOnce(sampleLearning);
    queries.reactivateRepositoryLearning.mockResolvedValueOnce({
      status: "reactivated",
      learning: sampleLearning,
    });

    await expect(
      archiveRepositoryLearningAction({ learningId: sampleLearning.id }),
    ).resolves.toEqual({ success: true, data: null, error: null });

    await expect(
      reactivateRepositoryLearningAction({ learningId: sampleLearning.id }),
    ).resolves.toEqual({ success: true, data: null, error: null });

    expect(queries.archiveRepositoryLearning).toHaveBeenCalledWith(
      42,
      100,
      sampleLearning.id,
      { actorLogin: "maintainer" },
    );
    expect(queries.reactivateRepositoryLearning).toHaveBeenCalledWith(
      42,
      100,
      sampleLearning.id,
      { actorLogin: "maintainer" },
    );
  });

  it("surfaces quota errors on reactivate without leaking internals", async () => {
    queries.reactivateRepositoryLearning.mockResolvedValueOnce({
      status: "quota_exceeded",
    });

    await expect(
      reactivateRepositoryLearningAction({ learningId: sampleLearning.id }),
    ).resolves.toEqual({
      success: false,
      data: null,
      error: "This repository has reached the active learning limit.",
    });
  });
});
