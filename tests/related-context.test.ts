import { describe, expect, it } from "vitest";

import { planRelatedCodeContext } from "@/lib/review/related-context";

const changedFile = (path: string, patch: string) => ({ path, patch });

describe("related code context planning", () => {
  it("resolves one-hop local imports and colocated tests deterministically", () => {
    const result = planRelatedCodeContext({
      changedFiles: [
        changedFile("src/auth/controller.ts", "export function run() {}"),
      ],
      fullFileContext: [
        {
          file: "src/auth/controller.ts",
          content: 'import { check } from "../security/check";\nexport function run() {}',
        },
      ],
      repositoryPaths: [
        "src/auth/controller.ts",
        "src/auth/controller.test.ts",
        "src/security/check.ts",
      ],
    });

    expect(result.candidates).toEqual([
      {
        file: "src/security/check.ts",
        reasons: ["direct_import", "public_contract"],
      },
      {
        file: "src/auth/controller.test.ts",
        reasons: ["colocated_test", "public_contract"],
      },
    ]);
  });

  it("resolves multiline static imports but ignores dynamic imports", () => {
    const result = planRelatedCodeContext({
      changedFiles: [changedFile("src/app.ts", "" )],
      fullFileContext: [
        {
          file: "src/app.ts",
          content: [
            "import {",
            "  check,",
            '} from "./security/check";',
            'const lazy = import("./dynamic");',
          ].join("\n"),
        },
      ],
      repositoryPaths: ["src/app.ts", "src/security/check.ts", "src/dynamic.ts"],
    });

    expect(result.candidates).toEqual([
      { file: "src/security/check.ts", reasons: ["direct_import"] },
    ]);
  });

  it("rejects aliases, dynamic imports, traversal, generated paths, and ambiguity", () => {
    const result = planRelatedCodeContext({
      changedFiles: [
        changedFile(
          "src/app.ts",
          [
            'import "@/security/check";',
            'import("./dynamic");',
            'import "../../outside";',
            'import "./generated/generated";',
            'import "./ambiguous";',
          ].join("\n"),
        ),
      ],
      fullFileContext: [],
      repositoryPaths: [
        "src/app.ts",
        "src/generated/generated.ts",
        "src/ambiguous.ts",
        "src/ambiguous/index.ts",
        "outside.ts",
      ],
    });

    expect(result.candidates).toEqual([]);
  });

  it("deduplicates supplied and changed files and applies the cutoff", () => {
    const result = planRelatedCodeContext({
      changedFiles: [
        changedFile(
          "src/auth/controller.ts",
          'import "../security/check";\nimport "../db/store";',
        ),
        changedFile("src/view.ts", 'import "./widget";'),
      ],
      fullFileContext: [
        { file: "src/security/check.ts", content: "export const check = true;" },
      ],
      repositoryPaths: [
        "src/auth/controller.ts",
        "src/db/store.ts",
        "src/view.ts",
        "src/widget.ts",
      ],
      maxFiles: 1,
    });

    expect(result.candidates).toEqual([
      { file: "src/db/store.ts", reasons: ["direct_import"] },
    ]);
  });

  it("respects the remaining request allowance", () => {
    const result = planRelatedCodeContext({
      changedFiles: [changedFile("src/app.ts", 'import "./security/check";')],
      fullFileContext: [],
      repositoryPaths: ["src/security/check.ts"],
      requestBudget: 0,
    });

    expect(result.candidates).toEqual([]);
  });
});
