import { App, Octokit, RequestError } from "octokit";
import { z } from "zod";

import { INSTRUCTIONS_TOKEN_CAP } from "../config/constants";
import { parseEnv } from "../config/env";

type InstallationOctokit = Awaited<ReturnType<App["getInstallationOctokit"]>>;
type AppClient = Pick<App, "getInstallationOctokit">;
type OAuthClient = Pick<Octokit, "paginate">;

export type GitHubClientDependencies = {
  app: AppClient;
  createOAuthClient: (token: string) => OAuthClient;
};

export type InstallationClient = InstallationOctokit;

const installationSchema = z.object({ id: z.number().int().positive() });

const fileResponseSchema = z.object({
  type: z.literal("file"),
  encoding: z.literal("base64"),
  content: z.string(),
});

const pullResponseSchema = z.object({
  head: z.object({ sha: z.string().min(1) }),
});

function createDefaultDependencies(): GitHubClientDependencies {
  const env = parseEnv();
  const privateKey = Buffer.from(
    env.GITHUB_APP_PRIVATE_KEY_BASE64,
    "base64",
  ).toString("utf8");
  const app = new App({
    appId: Number(env.GITHUB_APP_ID),
    privateKey,
  });

  return {
    app,
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

    async getUserInstallations(userOauthToken: string) {
      const installations = await dependencies
        .createOAuthClient(userOauthToken)
        .paginate("GET /user/installations", { per_page: 100 });
      return z.array(installationSchema).parse(installations).map(
        (installation) => installation.id,
      );
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
  upsertComment: (...args: Parameters<GitHubClient["upsertComment"]>) =>
    getDefaultClient().upsertComment(...args),
  getUserInstallations: (
    ...args: Parameters<GitHubClient["getUserInstallations"]>
  ) => getDefaultClient().getUserInstallations(...args),
};

export const {
  fetchPrDiff,
  fetchPrHeadSha,
  fetchInstructionsFile,
  upsertComment,
  getUserInstallations,
} = githubClient;
