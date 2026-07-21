import { describe, expect, it } from "vitest";

import {
  installationEventSchema,
  installationRepositoriesEventSchema,
  pullRequestEventSchema,
} from "@/lib/github/events";
import { reviewJobSchema } from "@/lib/review/job";
import { reviewOutputSchema } from "@/lib/review/schema";

const sha = "0123456789abcdef0123456789abcdef01234567";

describe("GitHub boundary schemas", () => {
  it("parses the supported pull request fields and ignores extra payload data", () => {
    const result = pullRequestEventSchema.parse({
      action: "opened",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo", private: true },
      pull_request: {
        number: 7,
        draft: false,
        title: "Update dependency",
        body: null,
        head: { sha, label: "owner:branch" },
        user: { login: "author", type: "User", id: 9 },
      },
      sender: { login: "github" },
    });

    expect(result.repository).toEqual({ id: 100, full_name: "owner/repo" });
    expect(result.pull_request.head).toEqual({ sha });
    expect("sender" in result).toBe(false);
  });

  it("rejects malformed pull request SHAs and missing fields", () => {
    expect(() =>
      pullRequestEventSchema.parse({
        action: "opened",
        installation: { id: 42 },
        repository: { id: 100, full_name: "owner/repo" },
        pull_request: {
          number: 7,
          draft: false,
          title: "Update dependency",
          body: null,
          head: { sha: "not-a-sha" },
          user: { login: "author", type: "User" },
        },
      }),
    ).toThrow();
  });

  it("parses installation and repository synchronization events", () => {
    expect(
      installationEventSchema.parse({
        action: "created",
        installation: { id: 42, account: { login: "owner", type: "Organization" } },
        repositories: [{ id: 100, full_name: "owner/repo" }],
      }),
    ).toMatchObject({ action: "created", installation: { id: 42 } });

    expect(
      installationRepositoriesEventSchema.parse({
        action: "added",
        installation: { id: 42 },
        repositories_added: [{ id: 100, full_name: "owner/repo" }],
        repositories_removed: [],
      }),
    ).toHaveProperty("repositories_added");
  });
});

describe("review boundary schemas", () => {
  it("parses a valid QStash review job", () => {
    expect(
      reviewJobSchema.parse({
        installationId: 42,
        repositoryId: 100,
        repoFullName: "owner/repo",
        prNumber: 7,
        headSha: sha,
        deliveryId: "delivery-1",
      }),
    ).toMatchObject({ installationId: 42, headSha: sha });
  });

  it("rejects unsupported LLM enum values", () => {
    expect(() =>
      reviewOutputSchema.parse({
        summary: "Review complete.",
        verdict: "ship-it",
        findings: [],
      }),
    ).toThrow();
  });
});
