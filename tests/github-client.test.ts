import { describe, expect, it, vi } from "vitest";

import {
  createGitHubClient,
  type GitHubClientDependencies,
  type InstallationClient,
} from "@/lib/github/client";

const sha = "0123456789abcdef0123456789abcdef01234567";

function createMockClient() {
  const request = vi.fn(
    (route: string, params?: { headers?: { accept?: string } }) => {
    if (route.includes("/contents/")) {
      return Promise.resolve({
        data: {
          type: "file",
          encoding: "base64",
          content: Buffer.from("review instructions").toString("base64"),
        },
      });
    }
    if (route.startsWith("POST")) return Promise.resolve({ data: { id: 501 } });
    if (route.startsWith("PATCH")) return Promise.resolve({ data: { id: 502 } });
    if (route.includes("/pulls/") && params?.headers?.accept) {
      return Promise.resolve({ data: "diff --git a/file.ts b/file.ts" });
    }
    if (route.includes("/pulls/")) {
      return Promise.resolve({ data: { head: { sha } } });
    }
    return Promise.resolve({ data: {} });
    },
  );
  const installationClient = {
    request,
  } as unknown as InstallationClient;
  const oauthRequest = vi.fn().mockResolvedValue({
    data: { installations: [{ id: 42 }, { id: 84 }] },
  });
  const dependencies = {
    app: {
      getInstallationOctokit: vi.fn().mockResolvedValue(installationClient),
    },
    createOAuthClient: vi.fn().mockReturnValue({ request: oauthRequest }),
  } as unknown as GitHubClientDependencies;

  return {
    client: createGitHubClient(dependencies),
    request,
    oauthRequest,
  };
}

describe("GitHub client", () => {
  it("fetches a PR diff and current head SHA through an installation client", async () => {
    const { client, request } = createMockClient();

    await expect(client.fetchPrDiff(42, "owner/repo", 7)).resolves.toContain("diff --git");
    await expect(client.fetchPrHeadSha(42, "owner/repo", 7)).resolves.toBe(sha);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("fetches .aireview.md and truncates decoded instructions", async () => {
    const { client, request } = createMockClient();

    await expect(client.fetchInstructionsFile(42, "owner/repo", sha)).resolves.toBe(
      "review instructions",
    );
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/contents/{path}",
      { owner: "owner", repo: "repo", path: ".aireview.md", ref: sha },
    );
  });

  it("creates new comments and updates existing comments in place", async () => {
    const { client, request } = createMockClient();

    await expect(client.upsertComment(42, "owner/repo", 7, null, "new")).resolves.toBe(501);
    await expect(client.upsertComment(42, "owner/repo", 7, 501, "edited")).resolves.toBe(502);
    expect(request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      { owner: "owner", repo: "repo", issue_number: 7, body: "new" },
    );
    expect(request).toHaveBeenCalledWith(
      "PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}",
      { owner: "owner", repo: "repo", comment_id: 501, body: "edited" },
    );
  });

  it("returns installation IDs from the authenticated user's GitHub access", async () => {
    const { client, oauthRequest } = createMockClient();

    await expect(client.getUserInstallations("oauth-token")).resolves.toEqual([42, 84]);
    expect(oauthRequest).toHaveBeenCalledWith("GET /user/installations", { per_page: 100 });
  });
});
