import { describe, expect, it } from "vitest";

import {
  selectEligibleFindings,
  selectResolvedFindingIds,
} from "@/lib/review/reconciliation";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const finding = {
  id,
  file: "src/auth.ts",
  line: 7,
  title: "Missing authorization",
  detail: "The request bypasses authorization.",
  severity: "high" as const,
  category: "security" as const,
  suggestion: null,
};

describe("finding reconciliation", () => {
  it("re-evaluates only findings whose file is touched by the incremental range", () => {
    const eligible = selectEligibleFindings(
      [finding, { ...finding, id: otherId, file: "src/other.ts" }],
      [{ path: "src/auth.ts", patch: "@@ -7 +7 @@\n+safe();" }],
    );

    expect(eligible).toEqual([finding]);
  });

  it("fails closed for unknown and duplicate finding updates", () => {
    const resolved = selectResolvedFindingIds(
      [
        { findingId: id, status: "resolved", reason: "The guard is restored." },
        { findingId: id, status: "open", reason: "Conflicting duplicate." },
        { findingId: otherId, status: "resolved", reason: "Not allowlisted." },
      ],
      [finding],
    );

    expect(resolved).toEqual([id]);
  });
});
