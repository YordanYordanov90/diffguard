import { describe, expect, it, vi } from "vitest";

import {
  createFullFileContextMetadata,
  isSafeContextPath,
  isUnsupportedContextPath,
  selectFullFileContext,
  validateFullFileContent,
} from "@/lib/review/context";
import {
  retrieveFullFileContext,
  retrieveRelatedCodeContext,
} from "@/lib/workers/context";

const hunk = (path: string) => ({
  path,
  patch: `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-old\n+new`,
});

describe("full-file context", () => {
  it("selects deterministically in existing risk order", () => {
    const result = selectFullFileContext([
      hunk("src/view.ts"),
      hunk("src/auth/session.ts"),
      hunk("tests/view.test.ts"),
    ]);

    expect(result.candidates).toEqual([
      {
        file: "src/auth/session.ts",
        reasons: ["security_sensitive", "incomplete_hunk"],
      },
      { file: "src/view.ts", reasons: ["incomplete_hunk"] },
      { file: "tests/view.test.ts", reasons: ["incomplete_hunk"] },
    ]);
  });

  it("includes candidate findings and applies the hard file cap", () => {
    const result = selectFullFileContext(
      [hunk("src/a.ts"), hunk("src/b.ts"), hunk("src/c.ts")],
      { candidateFiles: ["src/c.ts"], maxFiles: 2 },
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[2]).toBeUndefined();
    expect(result.candidates.at(-1)?.reasons).toContain("incomplete_hunk");
  });

  it("rejects unsafe, generated, and binary paths", () => {
    expect(isSafeContextPath("src/auth.ts")).toBe(true);
    expect(isSafeContextPath("src\\auth.ts")).toBe(true);
    expect(isSafeContextPath("src\\..\\secrets.txt")).toBe(false);
    expect(isSafeContextPath("src//auth.ts")).toBe(false);
    expect(isSafeContextPath("C:\\repo\\auth.ts")).toBe(false);
    expect(isSafeContextPath("../secrets.txt")).toBe(false);
    expect(isUnsupportedContextPath("dist/app.js")).toBe(true);
    expect(isUnsupportedContextPath("src/icon.png")).toBe(true);
    expect(isUnsupportedContextPath("src/auth.ts")).toBe(false);
    expect(selectFullFileContext([hunk("../secrets.txt"), hunk("dist/app.js")]).candidates).toEqual([]);
  });

  it("enforces byte, token, and binary-content limits", () => {
    expect(validateFullFileContent("hello")).toEqual({ ok: true, bytes: 5, tokens: 2 });
    expect(validateFullFileContent("\0binary")).toEqual({ ok: false, reason: "unsupported" });
    expect(validateFullFileContent("123456", { maxBytes: 5 })).toEqual({
      ok: false,
      reason: "oversized",
    });
  });

  it("continues after a partial fetch failure and exposes aggregate metadata only", async () => {
    const fetchRepositoryFile = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary GitHub failure"))
      .mockResolvedValueOnce({ status: "fetched", content: "const ok = true;", byteLength: 16 });

    const result = await retrieveFullFileContext({
      installationId: 42,
      repoFullName: "owner/repo",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      files: [hunk("src/auth/session.ts"), hunk("src/view.ts")],
      fetchRepositoryFile,
    });

    expect(result.files).toEqual([{ file: "src/view.ts", content: "const ok = true;" }]);
    expect(result.metadata.candidateCount).toBe(2);
    expect(result.metadata.fetchedCount).toBe(1);
    expect(result.metadata.missReasons.unavailable).toBe(1);
    expect(result.metadata).not.toHaveProperty("source");
    expect(fetchRepositoryFile).toHaveBeenNthCalledWith(
      1,
      42,
      "owner/repo",
      "src/auth/session.ts",
      "0123456789abcdef0123456789abcdef01234567",
      expect.any(Number),
      expect.any(AbortSignal),
    );
  });

  it("respects the aggregate prompt context budget", async () => {
    const fetchRepositoryFile = vi.fn().mockResolvedValue({
      status: "fetched",
      content: "1234567890",
      byteLength: 10,
    });

    const result = await retrieveFullFileContext({
      installationId: 42,
      repoFullName: "owner/repo",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      files: [hunk("src/auth/session.ts")],
      fetchRepositoryFile,
      totalByteBudget: 0,
      totalTokenBudget: 0,
    });

    expect(result.files).toEqual([]);
    expect(result.metadata.missReasons.over_budget).toBe(1);
    expect(fetchRepositoryFile).not.toHaveBeenCalled();
  });

  it("keeps truncated fetches distinct from unsupported misses", async () => {
    const result = await retrieveFullFileContext({
      installationId: 42,
      repoFullName: "owner/repo",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      files: [hunk("src/auth/session.ts")],
      fetchRepositoryFile: vi.fn().mockResolvedValue({ status: "truncated" }),
    });

    expect(result.files).toEqual([]);
    expect(result.metadata.missReasons.truncated).toBe(1);
    expect(result.metadata.missReasons.unsupported).toBe(0);
  });

  it("retrieves related candidates with reasons under the shared budget", async () => {
    const result = await retrieveRelatedCodeContext({
      installationId: 42,
      repoFullName: "owner/repo",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      candidates: [{ file: "src/security/check.ts", reasons: ["direct_import"] }],
      fetchRepositoryFile: vi.fn().mockResolvedValue({
        status: "fetched",
        content: "export const check = true;",
        byteLength: 26,
      }),
      totalByteBudget: 26,
      totalTokenBudget: 7,
    });

    expect(result.files).toEqual([
      {
        file: "src/security/check.ts",
        reason: "direct_import",
        content: "export const check = true;",
      },
    ]);
    expect(result.metadata.suppliedBytes).toBe(26);
  });

  it("creates zeroed safe metadata", () => {
    expect(createFullFileContextMetadata(3)).toEqual({
      candidateCount: 3,
      fetchedCount: 0,
      suppliedBytes: 0,
      suppliedTokens: 0,
      missReasons: {
        missing: 0,
        unsupported: 0,
        oversized: 0,
        truncated: 0,
        unavailable: 0,
        timeout: 0,
        over_budget: 0,
      },
    });
  });
});
