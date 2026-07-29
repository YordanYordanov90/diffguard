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

function isNotFound(error: unknown) {
  return error instanceof RequestError && error.status === 404;
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
  fetchInstructionsFile: (
    ...args: Parameters<GitHubClient["fetchInstructionsFile"]>
  ) => getDefaultClient().fetchInstructionsFile(...args),
  fetchRepositoryFile: (
    ...args: Parameters<GitHubClient["fetchRepositoryFile"]>
  ) => getDefaultClient().fetchRepositoryFile(...args),
  fetchRepositoryTree: (
    ...args: Parameters<GitHubClient["fetchRepositoryTree"]>
  ) => getDefaultClient().fetchRepositoryTree(...args),
  upsertComment: (...args: Parameters<GitHubClient["upsertComment"]>) =>
    getDefaultClient().upsertComment(...args),
  createPullRequestReview: (
    ...args: Parameters<GitHubClient["createPullRequestReview"]>
  ) => getDefaultClient().createPullRequestReview(...args),
  listPullRequestReviewComments: (
    ...args: Parameters<GitHubClient["listPullRequestReviewComments"]>
  ) => getDefaultClient().listPullRequestReviewComments(...args),
  getUserInstallations: (
    ...args: Parameters<GitHubClient["getUserInstallations"]>
  ) => getDefaultClient().getUserInstallations(...args),
};

export const {
  fetchPrDiff,
  fetchPrHeadSha,
  fetchInstructionsFile,
  fetchRepositoryFile,
  fetchRepositoryTree,
  upsertComment,
  createPullRequestReview,
  listPullRequestReviewComments,
  getUserInstallations,
} = githubClient;
