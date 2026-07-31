import { App, Octokit, RequestError } from "octokit";
import { z } from "zod";

import { INSTRUCTIONS_TOKEN_CAP } from "../config/constants";
import { parseEnv } from "../config/env";
import {
  parseAccessibleInstallations,
  type AccessibleInstallation,
} from "./accessible-installation";
import {
  isSafeRepositoryPath,
  normalizeRepositoryPath,
} from "../repository/path";

export type { AccessibleInstallation } from "./accessible-installation";

type InstallationOctokit = Awaited<ReturnType<App["getInstallationOctokit"]>>;
type AppClient = Pick<App, "getInstallationOctokit">;
type OAuthClient = Pick<Octokit, "paginate">;

export type GitHubClientDependencies = {
  app: AppClient;
  createOAuthClient: (token: string) => OAuthClient;
};

export type InstallationClient = InstallationOctokit;

export type RepositoryFileResult =
  | { status: "fetched"; content: string; byteLength: number }
  | { status: "missing" | "unsupported" | "oversized" | "truncated" };

export type RepositoryTreeResult =
  | { status: "fetched"; paths: string[] }
  | { status: "unavailable" | "truncated" };

export type CommitComparisonResult =
  | {
      status: "compared";
      comparisonStatus: "ahead" | "behind" | "diverged" | "identical";
      aheadBy: number;
      behindBy: number;
      truncated: boolean;
    }
  | { status: "unavailable" };

const fileResponseSchema = z.object({
  type: z.literal("file"),
  encoding: z.literal("base64"),
  content: z.string(),
  size: z.number().int().nonnegative().optional(),
});

const pullResponseSchema = z.object({
  head: z.object({ sha: z.string().min(1) }),
});

const repositoryTreeResponseSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      mode: z.string().optional(),
    }),
  ).max(20_000),
});

const commitComparisonSchema = z.object({
  status: z.enum(["ahead", "behind", "diverged", "identical"]),
  ahead_by: z.number().int().nonnegative(),
  behind_by: z.number().int().nonnegative(),
  total_commits: z.number().int().nonnegative(),
  commits: z.array(z.unknown()).max(300),
  files: z.array(z.unknown()).max(400).optional(),
});

const commitPullsSchema = z.array(
  z.object({
    number: z.number().int().positive(),
  }),
);

const repositoryShaSchema = z.string().regex(/^[0-9a-f]{40}$/i);

const pullRequestReviewSchema = z.object({
  id: z.number().int().positive(),
});

const pullRequestReviewCommentSchema = z.object({
  id: z.number().int().positive(),
  path: z.string().min(1),
  line: z.number().int().positive().nullable().optional(),
  original_line: z.number().int().positive().nullable().optional(),
  start_line: z.number().int().positive().nullable().optional(),
  body: z.string(),
});

const pullRequestReviewCommentScopeSchema = z.object({
  pull_request_url: z.string().url(),
});

/** GitHub collaborator permission levels used for Feature 30 feedback auth. */
export type RepositoryPermission =
  | "admin"
  | "maintain"
  | "write"
  | "triage"
  | "read"
  | "none";

const collaboratorPermissionSchema = z.object({
  permission: z.enum(["admin", "maintain", "write", "triage", "read", "none"]),
});

const issueCommentSchema = z.object({
  id: z.number().int().positive(),
  body: z.string(),
  user: z.object({
    login: z.string().min(1),
  }),
});

const pullRequestReviewReplySchema = z.object({
  id: z.number().int().positive(),
  in_reply_to_id: z.number().int().positive().nullable().optional(),
  body: z.string(),
});

export type PullRequestReviewCommentInput = {
  path: string;
  body: string;
  line: number;
  side: "RIGHT" | "LEFT";
  startLine?: number;
  startSide?: "RIGHT" | "LEFT";
};

export type CreatedPullRequestReviewComment = {
  id: number;
  path: string;
  line: number | null;
  startLine: number | null;
  body: string;
};

export type CreatePullRequestReviewResult = {
  reviewId: number;
};

/**
 * Result of fetching a same-repo issue for linked-requirement validation.
 * Permission or access failures are soft so ordinary code review continues.
 */
export type RepositoryIssueResult =
  | {
      status: "fetched";
      issueNumber: number;
      title: string;
      body: string | null;
      state: string;
    }
  | {
      status:
        | "missing"
        | "forbidden"
        | "not_an_issue"
        | "invalid"
        | "unavailable";
    };

const repositoryIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.string().min(1),
  state_reason: z.enum(["completed", "not_planned", "duplicate", "reopened"]).nullable().optional(),
  /** Present when the "issue" is actually a pull request. */
  pull_request: z.unknown().optional(),
});

function createDefaultDependencies(): GitHubClientDependencies {
  let app: AppClient | undefined;

  return {
    /**
     * Lazily construct the GitHub App client. OAuth-only calls
     * (`getUserInstallations`) never need the App private key — required
     * for the dashboard access path.
     */
    get app(): AppClient {
      if (!app) {
        const env = parseEnv();
        const privateKey = Buffer.from(
          env.GITHUB_APP_PRIVATE_KEY_BASE64,
          "base64",
        ).toString("utf8");
        app = new App({
          appId: Number(env.GITHUB_APP_ID),
          privateKey,
        });
      }
      return app;
    },
    createOAuthClient: (token) => new Octokit({ auth: token }),
  };
}

function parseRepositoryName(fullName: string) {
  const [owner, repo, ...extra] = fullName.split("/");
  if (!owner || !repo || extra.length > 0) {
    throw new Error("Repository name must have the format owner/repository.");
  }

  return { owner, repo };
}

function isPullRequestReviewCommentInScope(
  pullRequestUrl: string,
  owner: string,
  repo: string,
  prNumber: number,
) {
  try {
    const parsed = new URL(pullRequestUrl);
    return (
      parsed.hostname === "api.github.com" &&
      parsed.pathname.toLowerCase() ===
        `/repos/${owner}/${repo}/pulls/${prNumber}`.toLowerCase()
    );
  } catch {
    return false;
  }
}

function isNotFound(error: unknown) {
  return error instanceof RequestError && error.status === 404;
}

function isForbidden(error: unknown) {
  return error instanceof RequestError && error.status === 403;
}

function isUnsupportedInstructionResponse(error: unknown) {
  return (
    error instanceof RequestError &&
    [403, 413, 422].includes(error.status)
  );
}

function decodeRepositoryContent(value: string): Uint8Array | null {
  const normalized = value.replace(/\s/g, "");
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    return null;
  }
  const bytes = Buffer.from(normalized, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  return canonical === normalized.replace(/=+$/, "") ? bytes : null;
}

async function getInstallationClient(
  dependencies: GitHubClientDependencies,
  installationId: number,
) {
  return dependencies.app.getInstallationOctokit(installationId);
}

async function fetchFile(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
) {
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
      },
    );
    const parsed = fileResponseSchema.safeParse(response.data);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (isNotFound(error) || isUnsupportedInstructionResponse(error)) return null;
    throw error;
  }
}

export function createGitHubClient(
  dependencies: GitHubClientDependencies = createDefaultDependencies(),
) {
  return {
    async fetchPrDiff(
      installationId: number,
      repoFullName: string,
      prNumber: number,
    ) {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        {
          owner,
          repo,
          pull_number: prNumber,
          headers: { accept: "application/vnd.github.v3.diff" },
        },
      );
      if (typeof response.data !== "string") {
        throw new Error("GitHub returned an unexpected pull request diff.");
      }

      return response.data;
    },

    async fetchPrHeadSha(
      installationId: number,
      repoFullName: string,
      prNumber: number,
    ) {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        { owner, repo, pull_number: prNumber },
      );

      return pullResponseSchema.parse(response.data).head.sha;
    },

    /**
     * Compare two server-validated SHAs within the authorized repository.
     * Does not return file contents or diffs — only ancestry metadata.
     */
    async fetchCommitComparison(
      installationId: number,
      repoFullName: string,
      baseSha: string,
      headSha: string,
    ): Promise<CommitComparisonResult> {
      repositoryShaSchema.parse(baseSha);
      repositoryShaSchema.parse(headSha);
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/compare/{basehead}",
          {
            owner,
            repo,
            basehead: `${baseSha}...${headSha}`,
          },
        );
        const parsed = commitComparisonSchema.safeParse(response.data);
        if (!parsed.success) return { status: "unavailable" };
        const truncated =
          parsed.data.commits.length < parsed.data.total_commits ||
          (parsed.data.files !== undefined &&
            parsed.data.files.length >= 300 &&
            parsed.data.total_commits > 0);
        return {
          status: "compared",
          comparisonStatus: parsed.data.status,
          aheadBy: parsed.data.ahead_by,
          behindBy: parsed.data.behind_by,
          truncated,
        };
      } catch (error) {
        if (isNotFound(error)) return { status: "unavailable" };
        throw error;
      }
    },

    /**
     * Unified diff for the exclusive range base…head. Null when the base
     * commit is missing so callers can fall back to the full PR diff.
     */
    async fetchCommitRangeDiff(
      installationId: number,
      repoFullName: string,
      baseSha: string,
      headSha: string,
    ): Promise<string | null> {
      repositoryShaSchema.parse(baseSha);
      repositoryShaSchema.parse(headSha);
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/compare/{basehead}",
          {
            owner,
            repo,
            basehead: `${baseSha}...${headSha}`,
            headers: { accept: "application/vnd.github.v3.diff" },
          },
        );
        if (typeof response.data !== "string") {
          throw new Error("GitHub returned an unexpected commit-range diff.");
        }
        return response.data;
      } catch {
        // The caller broadens to a full PR diff when an incremental range is unavailable.
        return null;
      }
    },

    /**
     * Confirm a commit is associated with the given PR number via GitHub.
     * Uses the commits-list-pulls endpoint; failures are non-throwing false.
     */
    async isCommitOnPullRequest(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      commitSha: string,
    ): Promise<boolean> {
      repositoryShaSchema.parse(commitSha);
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls",
          {
            owner,
            repo,
            commit_sha: commitSha,
          },
        );
        const pulls = commitPullsSchema.safeParse(response.data);
        if (!pulls.success) return false;
        return pulls.data.some((pull) => pull.number === prNumber);
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },

    async fetchInstructionsFile(
      installationId: number,
      repoFullName: string,
      ref?: string,
    ) {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      const file =
        (await fetchFile(octokit, owner, repo, ".aireview.md", ref)) ??
        (await fetchFile(octokit, owner, repo, "AGENTS.md", ref));
      if (!file) return null;

      const decoded = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString(
        "utf8",
      );
      return decoded.slice(0, INSTRUCTIONS_TOKEN_CAP * 4);
    },

    /**
     * Fetch a same-repository issue by number for linked-requirement review.
     * Soft-fails on missing permission (403), missing issues, PRs-as-issues,
     * and malformed payloads so code review still proceeds.
     */
    async fetchRepositoryIssue(
      installationId: number,
      repoFullName: string,
      issueNumber: number,
    ): Promise<RepositoryIssueResult> {
      if (!Number.isInteger(issueNumber) || issueNumber < 1) {
        return { status: "invalid" };
      }
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}",
          {
            owner,
            repo,
            issue_number: issueNumber,
          },
        );
        const parsed = repositoryIssueSchema.safeParse(response.data);
        if (!parsed.success) return { status: "invalid" };
        if (parsed.data.pull_request !== undefined) {
          return { status: "not_an_issue" };
        }
        if (parsed.data.number !== issueNumber) return { status: "invalid" };
        if (parsed.data.state === "closed" && parsed.data.state_reason === "duplicate") {
          return { status: "unavailable" };
        }
        return {
          status: "fetched",
          issueNumber: parsed.data.number,
          title: parsed.data.title,
          body: parsed.data.body ?? null,
          state: parsed.data.state,
        };
      } catch (error) {
        if (isForbidden(error)) return { status: "forbidden" };
        if (isNotFound(error)) return { status: "missing" };
        // Soft-fail other errors so ordinary code review still completes.
        return { status: "unavailable" };
      }
    },

    async fetchRepositoryFile(
      installationId: number,
      repoFullName: string,
      path: string,
      ref: string,
      maxBytes: number,
      signal?: AbortSignal,
    ): Promise<RepositoryFileResult> {
      repositoryShaSchema.parse(ref);
      if (!Number.isInteger(maxBytes) || maxBytes < 0) {
        throw new Error("maxBytes must be a non-negative integer.");
      }
      if (!isSafeRepositoryPath(path)) return { status: "unsupported" };
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/contents/{path}",
          {
            owner,
            repo,
            path: normalizeRepositoryPath(path),
            ref,
            ...(signal ? { request: { signal } } : {}),
          },
        );
        const file = fileResponseSchema.safeParse(response.data);
        if (!file.success) return { status: "unsupported" };
        if (file.data.size !== undefined && file.data.size > maxBytes) {
          return { status: "oversized" };
        }
        const bytes = decodeRepositoryContent(file.data.content);
        if (!bytes) return { status: "unsupported" };
        let decoded: string;
        try {
          decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          return { status: "unsupported" };
        }
        const byteLength = bytes.byteLength;
        if (byteLength > maxBytes) return { status: "oversized" };
        if (file.data.size !== undefined && byteLength !== file.data.size) {
          return { status: "truncated" };
        }
        if (decoded.includes("\0")) return { status: "unsupported" };
        return { status: "fetched", content: decoded, byteLength };
      } catch (error) {
        if (isNotFound(error)) return { status: "missing" };
        if (isUnsupportedInstructionResponse(error)) return { status: "unsupported" };
        throw error;
      }
    },

    async fetchRepositoryTree(
      installationId: number,
      repoFullName: string,
      ref: string,
      signal?: AbortSignal,
    ): Promise<RepositoryTreeResult> {
      repositoryShaSchema.parse(ref);
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
          {
            owner,
            repo,
            tree_sha: ref,
            recursive: "1",
            ...(signal ? { request: { signal } } : {}),
          },
        );
        const tree = repositoryTreeResponseSchema.safeParse(response.data);
        if (!tree.success) return { status: "unavailable" };
        if (tree.data.truncated) return { status: "truncated" };
        return {
          status: "fetched",
          paths: tree.data.tree
            .filter(
              (entry) =>
                entry.type === "blob" &&
                entry.mode !== "120000" &&
                isSafeRepositoryPath(entry.path),
            )
            .map((entry) => normalizeRepositoryPath(entry.path)),
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return { status: "unavailable" };
        }
        if (isNotFound(error) || isUnsupportedInstructionResponse(error)) {
          return { status: "unavailable" };
        }
        throw error;
      }
    },

    async upsertComment(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      commentId: number | null,
      body: string,
    ) {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      if (commentId === null) {
        const response = await octokit.request(
          "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
          { owner, repo, issue_number: prNumber, body },
        );
        return z.object({ id: z.number().int().positive() }).parse(response.data).id;
      }

      const response = await octokit.request(
        "PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}",
        { owner, repo, comment_id: commentId, body },
      );
      return z.object({ id: z.number().int().positive() }).parse(response.data).id;
    },

    /** Reply once to a prior inline finding when trusted reconciliation resolves it. */
    async replyToPullRequestReviewComment(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      parentCommentId: number,
      body: string,
    ) {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      const response = await octokit.request(
        "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
        {
          owner,
          repo,
          pull_number: prNumber,
          body,
          comment_id: parentCommentId,
        },
      );
      return z.object({ id: z.number().int().positive() }).parse(response.data).id;
    },

    /** Verify that a stored inline comment belongs to this exact repository and PR. */
    async verifyPullRequestReviewCommentScope(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      commentId: number,
    ) {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/pulls/comments/{comment_id}",
          { owner, repo, comment_id: commentId },
        );
        const parsed = pullRequestReviewCommentScopeSchema.safeParse(response.data);
        return (
          parsed.success &&
          isPullRequestReviewCommentInScope(
            parsed.data.pull_request_url,
            owner,
            repo,
            prNumber,
          )
        );
      } catch {
        return false;
      }
    },

    /** Find a previously accepted resolution reply by its deterministic marker. */
    async findPullRequestReviewReply(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      parentCommentId: number,
      marker: string,
    ) {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
          {
            owner,
            repo,
            pull_number: prNumber,
            per_page: 100,
          },
        );
        const parsed = z.array(pullRequestReviewReplySchema).safeParse(response.data);
        if (!parsed.success) return null;
        return parsed.data.find(
          (comment) =>
            comment.in_reply_to_id === parentCommentId && comment.body.includes(marker),
        )?.id ?? null;
      } catch {
        return null;
      }
    },

    /** Submit one COMMENT review at the exact head SHA. */
    async createPullRequestReview(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      headSha: string,
      comments: PullRequestReviewCommentInput[],
    ): Promise<CreatePullRequestReviewResult> {
      repositoryShaSchema.parse(headSha);
      if (comments.length === 0) {
        throw new Error("createPullRequestReview requires at least one comment.");
      }

      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      const response = await octokit.request(
        "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
        {
          owner,
          repo,
          pull_number: prNumber,
          commit_id: headSha,
          event: "COMMENT",
          comments: comments.map((comment) => ({
            path: normalizeRepositoryPath(comment.path),
            body: comment.body,
            line: comment.line,
            side: comment.side,
            ...(comment.startLine !== undefined
              ? {
                  start_line: comment.startLine,
                  start_side: comment.startSide ?? comment.side,
                }
              : {}),
          })),
        },
      );

      const review = pullRequestReviewSchema.parse(response.data);
      return { reviewId: review.id };
    },

    /** List comments from a review that GitHub has already accepted. */
    async listPullRequestReviewComments(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      reviewId: number,
    ): Promise<CreatedPullRequestReviewComment[]> {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      const listed = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments",
        {
          owner,
          repo,
          pull_number: prNumber,
          review_id: reviewId,
          per_page: 100,
        },
      );

      const parsedComments = z
        .array(pullRequestReviewCommentSchema)
        .parse(listed.data)
        .map((comment) => ({
          id: comment.id,
          path: normalizeRepositoryPath(comment.path),
          line: comment.line ?? comment.original_line ?? null,
          startLine: comment.start_line ?? null,
          body: comment.body,
        }));

      return parsedComments;
    },

    /**
     * Returns validated AccessibleInstallation descriptors for the signed-in
     * user. Invalid items (e.g. non-github.com html_url) are dropped, never
     * trusted into the dashboard read model.
     */
    async getUserInstallations(
      userOauthToken: string,
    ): Promise<AccessibleInstallation[]> {
      const installations = await dependencies
        .createOAuthClient(userOauthToken)
        .paginate("GET /user/installations", { per_page: 100 });
      if (!Array.isArray(installations)) {
        throw new Error("GitHub installations response was not an array.");
      }
      return parseAccessibleInstallations(installations);
    },

    /**
     * Current repository permission for a user at processing time.
     * Missing collaborators and 404s become `none` — never trust webhook text.
     */
    async getCollaboratorPermission(
      installationId: number,
      repoFullName: string,
      username: string,
    ): Promise<RepositoryPermission> {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/collaborators/{username}/permission",
          { owner, repo, username },
        );
        const parsed = collaboratorPermissionSchema.safeParse(response.data);
        return parsed.success ? parsed.data.permission : "none";
      } catch (error) {
        if (isNotFound(error) || isForbidden(error)) return "none";
        throw error;
      }
    },

    /**
     * Fetch a single issue comment by id (Feature 33). Bodies are not persisted.
     */
    async fetchIssueComment(
      installationId: number,
      repoFullName: string,
      commentId: number,
    ): Promise<
      | { status: "fetched"; id: number; body: string; userLogin: string }
      | { status: "missing" | "unavailable" }
    > {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/comments/{comment_id}",
          { owner, repo, comment_id: commentId },
        );
        const parsed = issueCommentSchema.safeParse(response.data);
        if (!parsed.success) return { status: "unavailable" };
        return {
          status: "fetched",
          id: parsed.data.id,
          body: parsed.data.body,
          userLogin: parsed.data.user.login,
        };
      } catch (error) {
        if (isNotFound(error)) return { status: "missing" };
        if (isForbidden(error)) return { status: "unavailable" };
        throw error;
      }
    },

    /**
     * Confirm the PR still exists and is reachable with the installation token.
     */
    async fetchPullRequestAccessibility(
      installationId: number,
      repoFullName: string,
      prNumber: number,
    ): Promise<{ status: "accessible" | "missing" | "unavailable" }> {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
          owner,
          repo,
          pull_number: prNumber,
        });
        return { status: "accessible" };
      } catch (error) {
        if (isNotFound(error)) return { status: "missing" };
        if (isForbidden(error)) return { status: "unavailable" };
        throw error;
      }
    },

    /**
     * List recent issue comments on a PR for ephemeral thread context.
     * Callers must discard bodies after the request (Feature 33).
     */
    async listIssueComments(
      installationId: number,
      repoFullName: string,
      prNumber: number,
    ): Promise<
      | {
          status: "fetched";
          comments: { id: number; body: string; userLogin: string }[];
        }
      | { status: "unavailable" }
    > {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      try {
        const response = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            owner,
            repo,
            issue_number: prNumber,
            per_page: 100,
          },
        );
        const parsed = z.array(issueCommentSchema).safeParse(response.data);
        if (!parsed.success) return { status: "unavailable" };
        return {
          status: "fetched",
          comments: parsed.data.map((comment) => ({
            id: comment.id,
            body: comment.body,
            userLogin: comment.user.login,
          })),
        };
      } catch (error) {
        if (isNotFound(error) || isForbidden(error)) return { status: "unavailable" };
        throw error;
      }
    },

    /** Post a new issue comment on a PR (Feature 33 boundary ack / Feature 34 replies). */
    async createIssueComment(
      installationId: number,
      repoFullName: string,
      prNumber: number,
      body: string,
    ): Promise<number> {
      const { owner, repo } = parseRepositoryName(repoFullName);
      const octokit = await getInstallationClient(dependencies, installationId);
      const response = await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        { owner, repo, issue_number: prNumber, body },
      );
      return z.object({ id: z.number().int().positive() }).parse(response.data).id;
    },
  };
}

type GitHubClient = ReturnType<typeof createGitHubClient>;
let defaultClient: GitHubClient | undefined;

function getDefaultClient() {
  defaultClient ??= createGitHubClient();
  return defaultClient;
}

export const githubClient = {
  fetchPrDiff: (...args: Parameters<GitHubClient["fetchPrDiff"]>) =>
    getDefaultClient().fetchPrDiff(...args),
  fetchPrHeadSha: (...args: Parameters<GitHubClient["fetchPrHeadSha"]>) =>
    getDefaultClient().fetchPrHeadSha(...args),
  fetchCommitComparison: (
    ...args: Parameters<GitHubClient["fetchCommitComparison"]>
  ) => getDefaultClient().fetchCommitComparison(...args),
  fetchCommitRangeDiff: (
    ...args: Parameters<GitHubClient["fetchCommitRangeDiff"]>
  ) => getDefaultClient().fetchCommitRangeDiff(...args),
  isCommitOnPullRequest: (
    ...args: Parameters<GitHubClient["isCommitOnPullRequest"]>
  ) => getDefaultClient().isCommitOnPullRequest(...args),
  fetchInstructionsFile: (
    ...args: Parameters<GitHubClient["fetchInstructionsFile"]>
  ) => getDefaultClient().fetchInstructionsFile(...args),
  fetchRepositoryIssue: (
    ...args: Parameters<GitHubClient["fetchRepositoryIssue"]>
  ) => getDefaultClient().fetchRepositoryIssue(...args),
  fetchRepositoryFile: (
    ...args: Parameters<GitHubClient["fetchRepositoryFile"]>
  ) => getDefaultClient().fetchRepositoryFile(...args),
  fetchRepositoryTree: (
    ...args: Parameters<GitHubClient["fetchRepositoryTree"]>
  ) => getDefaultClient().fetchRepositoryTree(...args),
  upsertComment: (...args: Parameters<GitHubClient["upsertComment"]>) =>
    getDefaultClient().upsertComment(...args),
  replyToPullRequestReviewComment: (
    ...args: Parameters<GitHubClient["replyToPullRequestReviewComment"]>
  ) => getDefaultClient().replyToPullRequestReviewComment(...args),
  verifyPullRequestReviewCommentScope: (
    ...args: Parameters<GitHubClient["verifyPullRequestReviewCommentScope"]>
  ) => getDefaultClient().verifyPullRequestReviewCommentScope(...args),
  findPullRequestReviewReply: (
    ...args: Parameters<GitHubClient["findPullRequestReviewReply"]>
  ) => getDefaultClient().findPullRequestReviewReply(...args),
  createPullRequestReview: (
    ...args: Parameters<GitHubClient["createPullRequestReview"]>
  ) => getDefaultClient().createPullRequestReview(...args),
  listPullRequestReviewComments: (
    ...args: Parameters<GitHubClient["listPullRequestReviewComments"]>
  ) => getDefaultClient().listPullRequestReviewComments(...args),
  getUserInstallations: (
    ...args: Parameters<GitHubClient["getUserInstallations"]>
  ) => getDefaultClient().getUserInstallations(...args),
  getCollaboratorPermission: (
    ...args: Parameters<GitHubClient["getCollaboratorPermission"]>
  ) => getDefaultClient().getCollaboratorPermission(...args),
  fetchIssueComment: (
    ...args: Parameters<GitHubClient["fetchIssueComment"]>
  ) => getDefaultClient().fetchIssueComment(...args),
  fetchPullRequestAccessibility: (
    ...args: Parameters<GitHubClient["fetchPullRequestAccessibility"]>
  ) => getDefaultClient().fetchPullRequestAccessibility(...args),
  listIssueComments: (
    ...args: Parameters<GitHubClient["listIssueComments"]>
  ) => getDefaultClient().listIssueComments(...args),
  createIssueComment: (
    ...args: Parameters<GitHubClient["createIssueComment"]>
  ) => getDefaultClient().createIssueComment(...args),
};

export const {
  fetchPrDiff,
  fetchPrHeadSha,
  fetchCommitComparison,
  fetchCommitRangeDiff,
  isCommitOnPullRequest,
  fetchInstructionsFile,
  fetchRepositoryIssue,
  fetchRepositoryFile,
  fetchRepositoryTree,
  upsertComment,
  replyToPullRequestReviewComment,
  verifyPullRequestReviewCommentScope,
  findPullRequestReviewReply,
  createPullRequestReview,
  listPullRequestReviewComments,
  getUserInstallations,
  getCollaboratorPermission,
  fetchIssueComment,
  fetchPullRequestAccessibility,
  listIssueComments,
  createIssueComment,
} = githubClient;
