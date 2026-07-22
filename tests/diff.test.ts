import { describe, expect, it } from "vitest";

import { processDiff } from "@/lib/review/diff";

function fileDiff(path: string, body = "@@ -1 +1 @@\n-old\n+new") {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${body}`;
}

describe("diff processing", () => {
  it("excludes lockfiles, generated files, binaries, images, and vendored dependencies", () => {
    const rawDiff = [
      fileDiff("src/app.ts"),
      fileDiff("package-lock.json"),
      fileDiff("dist/app.js"),
      fileDiff("public/logo.png"),
      fileDiff("vendor/library.js"),
      `${fileDiff("assets/data.bin")}\nBinary files a/assets/data.bin and b/assets/data.bin differ`,
      fileDiff("src/app.min.js"),
    ].join("\n");

    expect(processDiff(rawDiff).fileTree).toEqual(["src/app.ts"]);
  });

  it("ranks security-sensitive paths before source, tests, and documentation", () => {
    const rawDiff = [
      fileDiff("README.md"),
      fileDiff("src/feature.ts"),
      fileDiff("tests/feature.test.ts"),
      fileDiff("api/auth.ts"),
      fileDiff("middleware.ts"),
      fileDiff("config/runtime.ts"),
    ].join("\n");

    expect(processDiff(rawDiff).fileTree).toEqual([
      "api/auth.ts",
      "middleware.ts",
      "config/runtime.ts",
      "src/feature.ts",
      "tests/feature.test.ts",
      "README.md",
    ]);
  });

  it("cuts off whole files at the token budget and reports skipped files in rank order", () => {
    const security = fileDiff("src/auth.ts", "@@ -1 +1 @@\n-old-auth\n+new-auth");
    const source = fileDiff("src/feature.ts", "@@ -1 +1 @@\n-old-feature\n+new-feature");
    const docs = fileDiff("README.md", "@@ -1 +1 @@\n-old-doc\n+new-doc");
    const budget = Math.ceil(security.length / 4) + Math.ceil(source.length / 4);

    const result = processDiff([docs, source, security].join("\n"), budget);

    expect(result.files.map((file) => file.path)).toEqual(["src/auth.ts", "src/feature.ts"]);
    expect(result.skippedFiles).toEqual(["README.md"]);
    expect(result.tokenEstimate).toBe(budget);
    expect(result.diff).toContain("new-auth");
    expect(result.diff).not.toContain("new-doc");
  });

  it("is deterministic and handles new or deleted files", () => {
    const rawDiff = [
      "diff --git a/deleted.ts b/deleted.ts\ndeleted file mode 100644\n--- a/deleted.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old",
      "diff --git a/new.ts b/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+new",
    ].join("\n");

    expect(processDiff(rawDiff)).toEqual(processDiff(rawDiff));
    expect(processDiff(rawDiff).fileTree).toEqual(["deleted.ts", "new.ts"]);
  });
});
