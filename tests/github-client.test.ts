import { describe, expect, it, vi } from "vitest";

import {
  createGitHubClient,
  type GitHubClientDependencies,
  type InstallationClient,
} from "@/lib/github/client";

const sha = "0123456789abcdef0123456789abcdef01234567";

function createMockClient(
  instructionResponse: unknown = {
    type: "file",
    encoding: "base64",
    content: Buffer.from("review instructions").toString("base64"),
  },
  treeResponse: unknown = { truncated: false, tree: [] },
) {
    const request = vi.fn(
    (route: string, params?: { headers?: { accept?: string }; event?: string }) => {
    if (route.includes("/git/trees/")) {
      return Promise.resolve({ data: treeResponse });
    }
    if (route.includes("/contents/")) {
      return Promise.resolve({
        data: instructionResponse,
      });
    }
    if (route.includes("/reviews/") && route.includes("/comments")) {
      return Promise.resolve({
        data: [
          {
            id: 7001,
            path: "src/auth.ts",
            line: 12,
            start_line: null,
            body: "inline finding",
          },
        ],
      });
    }
    if (route.includes("/pulls/comments/") && route.startsWith("GET")) {
      return Promise.resolve({
        data: {
          pull_request_url: "https://api.github.com/repos/owner/repo/pulls/7",
        },
      });
    }
    if (route === "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments") {
      return Promise.resolve({ data: [] });
    }
    if (route.includes("/pulls/") && route.endsWith("/reviews") && route.startsWith("POST")) {
      return Promise.resolve({ data: { id: 6001 } });
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
  const oauthInstallations = [
    {
      id: 42,
      account: { login: "acme", type: "Organization" },
      repository_selection: "all",
      html_url: "https://github.com/organizations/acme/settings/installations/42",
      suspended_at: null,
    },
    {
      id: 84,
      account: { login: "owner", type: "User" },
      repository_selection: "selected",
      html_url: "https://github.com/settings/installations/84",
      suspended_at: null,
    },
  ];
  const oauthRequest = vi.fn().mockResolvedValue({
    data: { installations: oauthInstallations },
  });
  const oauthPaginate = vi.fn().mockResolvedValue(oauthInstallations);
  const dependencies = {
    app: {
      getInstallationOctokit: vi.fn().mockResolvedValue(installationClient),
    },
    createOAuthClient: vi.fn().mockReturnValue({
      paginate: oauthPaginate,
      request: oauthRequest,
    }),
  } as unknown as GitHubClientDependencies;

  return {
    client: createGitHubClient(dependencies),
    request,
    oauthRequest,
    oauthPaginate,
  };
}

describe("GitHub client", () => {
  it("fetches a PR diff and current head SHA through an installation client", async () => {
    const { client, request } = createMockClient();

    await expect(client.fetchPrDiff(42, "owner/repo", 7)).resolves.toContain("diff --git");
    await expect(client.fetchPrHeadSha(42, "owner/repo", 7)).resolves.toBe(sha);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("compares commits and fetches a range diff with validated SHAs", async () => {
    const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const { client, request } = createMockClient();
    request.mockImplementation(
      (route: string, params?: { headers?: { accept?: string }; basehead?: string }) => {
        if (route.includes("/compare/") && params?.headers?.accept?.includes("diff")) {
          return Promise.resolve({ data: "diff --git a/new.ts b/new.ts" });
        }
        if (route.includes("/compare/")) {
          return Promise.resolve({
            data: {
              status: "ahead",
              ahead_by: 2,
              behind_by: 0,
              total_commits: 2,
              commits: [{}, {}],
              files: [{ filename: "new.ts" }],
            },
          });
        }
        if (route.includes("/commits/") && route.includes("/pulls")) {
          return Promise.resolve({ data: [{ number: 7 }] });
        }
        return Promise.resolve({ data: {} });
      },
    );

    await expect(
      client.fetchCommitComparison(42, "owner/repo", base, head),
    ).resolves.toEqual({
      status: "compared",
      comparisonStatus: "ahead",
      aheadBy: 2,
      behindBy: 0,
      truncated: false,
    });
    await expect(
      client.fetchCommitRangeDiff(42, "owner/repo", base, head),
    ).resolves.toContain("diff --git");
    await expect(
      client.isCommitOnPullRequest(42, "owner/repo", 7, base),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/compare/{basehead}",
      expect.objectContaining({ basehead: `${base}...${head}` }),
    );
  });

  it("marks truncated comparisons and missing bases as unavailable", async () => {
    const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const { client, request } = createMockClient();
    const { RequestError } = await import("octokit");

    request.mockResolvedValueOnce({
      data: {
        status: "ahead",
        ahead_by: 400,
        behind_by: 0,
        total_commits: 400,
        commits: Array.from({ length: 250 }, () => ({})),
        files: Array.from({ length: 300 }, () => ({ filename: "f.ts" })),
      },
    });
    await expect(
      client.fetchCommitComparison(42, "owner/repo", base, head),
    ).resolves.toMatchObject({ status: "compared", truncated: true });

    request.mockRejectedValueOnce(
      new RequestError("Not Found", 404, {
        response: {
          status: 404,
          headers: {},
          url: "https://api.github.com",
          data: {},
        },
        request: { method: "GET", url: "https://api.github.com", headers: {} },
      }),
    );
    await expect(
      client.fetchCommitComparison(42, "owner/repo", base, head),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("treats an unavailable range diff as a full-review fallback signal", async () => {
    const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const { client, request } = createMockClient();
    request.mockRejectedValueOnce(new Error("GitHub unavailable"));

    await expect(
      client.fetchCommitRangeDiff(42, "owner/repo", base, head),
    ).resolves.toBeNull();
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

  it("fetches same-repo issues and soft-fails permission/missing/PR cases", async () => {
    const { client, request } = createMockClient();
    const { RequestError } = await import("octokit");

    request.mockResolvedValueOnce({
      data: {
        number: 12,
        title: "Add rate limiting",
        body: "Require per-IP limits.",
        state: "open",
      },
    });
    await expect(client.fetchRepositoryIssue(42, "owner/repo", 12)).resolves.toEqual({
      status: "fetched",
      issueNumber: 12,
      title: "Add rate limiting",
      body: "Require per-IP limits.",
      state: "open",
    });
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/issues/{issue_number}",
      { owner: "owner", repo: "repo", issue_number: 12 },
    );

    request.mockResolvedValueOnce({
      data: {
        number: 13,
        title: "A pull request",
        body: null,
        state: "open",
        pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/13" },
      },
    });
    await expect(client.fetchRepositoryIssue(42, "owner/repo", 13)).resolves.toEqual({
      status: "not_an_issue",
    });

    request.mockResolvedValueOnce({
      data: {
        number: 14,
        title: "Duplicate issue",
        body: "Tracked elsewhere.",
        state: "closed",
        state_reason: "duplicate",
      },
    });
    await expect(client.fetchRepositoryIssue(42, "owner/repo", 14)).resolves.toEqual({
      status: "unavailable",
    });

    request.mockRejectedValueOnce(
      new RequestError("Forbidden", 403, {
        response: {
          status: 403,
          headers: {},
          url: "https://api.github.com",
          data: {},
        },
        request: { method: "GET", url: "https://api.github.com", headers: {} },
      }),
    );
    await expect(client.fetchRepositoryIssue(42, "owner/repo", 15)).resolves.toEqual({
      status: "forbidden",
    });

    request.mockRejectedValueOnce(
      new RequestError("Not Found", 404, {
        response: {
          status: 404,
          headers: {},
          url: "https://api.github.com",
          data: {},
        },
        request: { method: "GET", url: "https://api.github.com", headers: {} },
      }),
    );
    await expect(client.fetchRepositoryIssue(42, "owner/repo", 16)).resolves.toEqual({
      status: "missing",
    });

    await expect(client.fetchRepositoryIssue(42, "owner/repo", 0)).resolves.toEqual({
      status: "invalid",
    });
  });

  it("ignores unsupported oversized instruction responses", async () => {
    const { client } = createMockClient({
      type: "file",
      encoding: "none",
      content: "",
    });

    await expect(client.fetchInstructionsFile(42, "owner/repo", sha)).resolves.toBeNull();
  });

  it("fetches a bounded repository file at the exact validated head SHA", async () => {
    const content = "export const safe = true;";
    const { client, request } = createMockClient({
      type: "file",
      encoding: "base64",
      content: Buffer.from(content).toString("base64"),
      size: Buffer.byteLength(content),
    });

    await expect(
      client.fetchRepositoryFile(42, "owner/repo", "src\\auth.ts", sha, 1_000),
    ).resolves.toEqual({
      status: "fetched",
      content,
      byteLength: Buffer.byteLength(content),
    });
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: "owner",
        repo: "repo",
        path: "src/auth.ts",
        ref: sha,
      },
    );
  });

  it("rejects invalid refs and traversal paths before fetching", async () => {
    const { client, request } = createMockClient();

    await expect(
      client.fetchRepositoryFile(42, "owner/repo", "src/auth.ts", "main", 1_000),
    ).rejects.toThrow("Invalid");
    await expect(
      client.fetchRepositoryFile(42, "owner/repo", "../secrets.txt", sha, 1_000),
    ).resolves.toEqual({ status: "unsupported" });
    await expect(
      client.fetchRepositoryFile(42, "owner/repo", "src\\..\\secrets.txt", sha, 1_000),
    ).resolves.toEqual({ status: "unsupported" });
    await expect(
      client.fetchRepositoryFile(42, "owner/repo", "src//auth.ts", sha, 1_000),
    ).resolves.toEqual({ status: "unsupported" });
    await expect(
      client.fetchRepositoryFile(42, "owner/repo", "C:\\repo\\auth.ts", sha, 1_000),
    ).resolves.toEqual({ status: "unsupported" });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects malformed, non-text, oversized, and truncated content", async () => {
    const malformed = createMockClient({ type: "file", encoding: "base64", content: "not-base64" });
    await expect(
      malformed.client.fetchRepositoryFile(42, "owner/repo", "src/auth.ts", sha, 1_000),
    ).resolves.toEqual({ status: "unsupported" });

    const binary = createMockClient({
      type: "file",
      encoding: "base64",
      content: Buffer.from([0xff, 0xfe]).toString("base64"),
      size: 2,
    });
    await expect(
      binary.client.fetchRepositoryFile(42, "owner/repo", "src/auth.ts", sha, 1_000),
    ).resolves.toEqual({ status: "unsupported" });

    const oversized = createMockClient({
      type: "file",
      encoding: "base64",
      content: Buffer.from("123456").toString("base64"),
      size: 6,
    });
    await expect(
      oversized.client.fetchRepositoryFile(42, "owner/repo", "src/auth.ts", sha, 5),
    ).resolves.toEqual({ status: "oversized" });

    const truncated = createMockClient({
      type: "file",
      encoding: "base64",
      content: Buffer.from("hello").toString("base64"),
      size: 6,
    });
    await expect(
      truncated.client.fetchRepositoryFile(42, "owner/repo", "src/auth.ts", sha, 1_000),
    ).resolves.toEqual({ status: "truncated" });
  });

  it("fetches only safe blob paths from the exact head tree", async () => {
    const { client, request } = createMockClient(undefined, {
      truncated: false,
      tree: [
        { path: "src/auth.ts", type: "blob" },
        { path: "src/auth.test.ts", type: "blob" },
        { path: "src", type: "tree" },
        { path: "src/link.ts", type: "blob", mode: "120000" },
        { path: "../secrets.txt", type: "blob" },
      ],
    });

    await expect(client.fetchRepositoryTree(42, "owner/repo", sha)).resolves.toEqual({
      status: "fetched",
      paths: ["src/auth.ts", "src/auth.test.ts"],
    });
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      { owner: "owner", repo: "repo", tree_sha: sha, recursive: "1" },
    );
  });

  it("treats a truncated repository tree as a soft miss", async () => {
    const { client } = createMockClient(undefined, { truncated: true, tree: [] });

    await expect(client.fetchRepositoryTree(42, "owner/repo", sha)).resolves.toEqual({
      status: "truncated",
    });
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

  it("replies to a resolved inline finding through the pull-request comment API", async () => {
    const { client, request } = createMockClient();

    await expect(
      client.replyToPullRequestReviewComment(42, "owner/repo", 7, 7001, "Resolved."),
    ).resolves.toBe(501);
    expect(request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
      {
        owner: "owner",
        repo: "repo",
        pull_number: 7,
        body: "Resolved.",
        comment_id: 7001,
      },
    );
  });

  it("verifies that an inline comment belongs to the requested PR", async () => {
    const { client, request } = createMockClient();

    await expect(
      client.verifyPullRequestReviewCommentScope(42, "owner/repo", 7, 7001),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/pulls/comments/{comment_id}",
      { owner: "owner", repo: "repo", comment_id: 7001 },
    );

    request.mockResolvedValueOnce({
      data: {
        pull_request_url: "https://api.github.com/repos/owner/repo/pulls/8",
      },
    });
    await expect(
      client.verifyPullRequestReviewCommentScope(42, "owner/repo", 7, 7002),
    ).resolves.toBe(false);
  });

  it("finds an existing deterministic resolution reply", async () => {
    const { client, request } = createMockClient();
    request.mockResolvedValueOnce({
      data: [
        {
          id: 8001,
          in_reply_to_id: 7001,
          body: "resolved <!-- marker -->",
        },
      ],
    });

    await expect(
      client.findPullRequestReviewReply(42, "owner/repo", 7, 7001, "<!-- marker -->"),
    ).resolves.toBe(8001);
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
      { owner: "owner", repo: "repo", pull_number: 7, per_page: 100 },
    );
  });

  it("submits one COMMENT review and retrieves its comment ids separately", async () => {
    const { client, request } = createMockClient();

    await expect(
      client.createPullRequestReview(42, "owner/repo", 7, sha, [
        {
          path: "src/auth.ts",
          body: "inline finding",
          line: 12,
          side: "RIGHT",
        },
      ]),
    ).resolves.toEqual({ reviewId: 6001 });

    await expect(
      client.listPullRequestReviewComments(42, "owner/repo", 7, 6001),
    ).resolves.toEqual([
      {
        id: 7001,
        path: "src/auth.ts",
        line: 12,
        startLine: null,
        body: "inline finding",
      },
    ]);

    expect(request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
      {
        owner: "owner",
        repo: "repo",
        pull_number: 7,
        commit_id: sha,
        event: "COMMENT",
        comments: [
          {
            path: "src/auth.ts",
            body: "inline finding",
            line: 12,
            side: "RIGHT",
          },
        ],
      },
    );
    expect(request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments",
      {
        owner: "owner",
        repo: "repo",
        pull_number: 7,
        review_id: 6001,
        per_page: 100,
      },
    );
  });

  it("returns validated installation descriptors from the authenticated user's GitHub access", async () => {
    const { client, oauthPaginate } = createMockClient();

    await expect(client.getUserInstallations("oauth-token")).resolves.toEqual([
      {
        id: 42,
        account: { login: "acme", type: "Organization" },
        repository_selection: "all",
        html_url: "https://github.com/organizations/acme/settings/installations/42",
        suspended_at: null,
      },
      {
        id: 84,
        account: { login: "owner", type: "User" },
        repository_selection: "selected",
        html_url: "https://github.com/settings/installations/84",
        suspended_at: null,
      },
    ]);
    expect(oauthPaginate).toHaveBeenCalledWith("GET /user/installations", { per_page: 100 });
  });

  it("drops installations with non-github.com configuration URLs", async () => {
    const oauthPaginate = vi.fn().mockResolvedValue([
      {
        id: 7,
        account: { login: "safe", type: "User" },
        repository_selection: "selected",
        html_url: "https://github.com/settings/installations/7",
        suspended_at: null,
      },
      {
        id: 9,
        account: { login: "evil", type: "User" },
        repository_selection: "all",
        html_url: "https://evil.example/phish",
        suspended_at: null,
      },
    ]);
    const client = createGitHubClient({
      app: { getInstallationOctokit: vi.fn() },
      createOAuthClient: () => ({ paginate: oauthPaginate }),
    } as unknown as GitHubClientDependencies);

    await expect(client.getUserInstallations("oauth-token")).resolves.toEqual([
      {
        id: 7,
        account: { login: "safe", type: "User" },
        repository_selection: "selected",
        html_url: "https://github.com/settings/installations/7",
        suspended_at: null,
      },
    ]);
  });

  it("resolves OAuth installations without constructing the GitHub App client", async () => {
    const appAccess = vi.fn(() => {
      throw new Error("App private key must not be required for OAuth access");
    });
    const oauthPaginate = vi.fn().mockResolvedValue([
      {
        id: 7,
        account: { login: "owner", type: "User" },
        repository_selection: "selected",
        html_url: "https://github.com/settings/installations/7",
        suspended_at: null,
      },
    ]);
    const client = createGitHubClient({
      get app() {
        return appAccess();
      },
      createOAuthClient: () => ({ paginate: oauthPaginate }),
    } as unknown as GitHubClientDependencies);

    await expect(client.getUserInstallations("oauth-token")).resolves.toEqual([
      {
        id: 7,
        account: { login: "owner", type: "User" },
        repository_selection: "selected",
        html_url: "https://github.com/settings/installations/7",
        suspended_at: null,
      },
    ]);
    expect(appAccess).not.toHaveBeenCalled();
  });
});
