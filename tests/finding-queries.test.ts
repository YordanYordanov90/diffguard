import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  type FindingUpsertInput,
  reconcileFindings,
  upsertConfirmedFindings,
} from "@/lib/db/queries";

const baseFinding: FindingUpsertInput = {
  installationId: 42,
  repositoryId: 100,
  prNumber: 7,
  fingerprint: "a".repeat(64),
  confidence: "high",
  severity: "high",
  category: "security",
  file: "src/auth.ts",
  line: 12,
  title: "Missing authorization check",
  detail: "The handler skips the tenant ownership check.",
  observedBehavior: "Request proceeds without ownership validation.",
  causalPath: "handler -> repository.findById",
  violatedInvariant: "Every resource read must be tenant-scoped.",
  suggestion: "Verify resource ownership.",
  suggestedChange: null,
  reviewId: "review-1",
  headSha: "0123456789abcdef0123456789abcdef01234567",
};

type QueryDatabase = NonNullable<Parameters<typeof upsertConfirmedFindings>[1]>;

function createDatabase() {
  const limit = vi.fn().mockResolvedValue([{ id: 100 }]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const returning = vi
    .fn()
    .mockReturnValueOnce({ query: "first" })
    .mockReturnValueOnce({ query: "second" });
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  const batch = vi.fn().mockResolvedValue([
    [{ id: "finding-1" }],
    [{ id: "finding-2" }],
  ]);

  return {
    database: { select, insert, batch } as unknown as QueryDatabase,
    batch,
  };
}

describe("confirmed finding persistence", () => {
  it("submits all confirmed finding writes in one atomic batch", async () => {
    const { database, batch } = createDatabase();
    const results = await upsertConfirmedFindings(
      [baseFinding, { ...baseFinding, fingerprint: "b".repeat(64) }],
      database,
    );

    expect(batch).toHaveBeenCalledOnce();
    expect(batch).toHaveBeenCalledWith([
      { query: "first" },
      { query: "second" },
    ]);
    expect(results).toEqual([{ id: "finding-1" }, { id: "finding-2" }]);
  });

  it("keeps a dismissed finding terminal when matching evidence returns", async () => {
    const { database, batch } = createDatabase();
    batch.mockResolvedValueOnce([[]]);

    await expect(
      reconcileFindings(
        {
          installationId: baseFinding.installationId,
          repositoryId: baseFinding.repositoryId,
          prNumber: baseFinding.prNumber,
          headSha: baseFinding.headSha,
          findingInputs: [baseFinding],
          resolvedFindingIds: [],
        },
        database,
      ),
    ).resolves.toEqual({ findings: [], resolved: [] });
  });
});
