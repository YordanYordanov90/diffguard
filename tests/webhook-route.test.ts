import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  handleGitHubWebhook,
  verifyGitHubSignature,
} from "@/lib/webhooks/github";

const secret = "test-webhook-secret";
const sha = "0123456789abcdef0123456789abcdef01234567";

const pullRequestPayload = {
  action: "opened",
  installation: { id: 42 },
  repository: { id: 100, full_name: "owner/repo" },
  pull_request: {
    number: 7,
    draft: false,
    title: "Add feature",
    body: null,
    head: { sha },
    user: { login: "author", type: "User" },
  },
};

function signedRequest(
  body: string,
  eventName = "pull_request",
  signatureSecret = secret,
) {
  const signature = createHmac("sha256", signatureSecret).update(body).digest("hex");
  return new Request("http://localhost/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": eventName,
      "x-github-delivery": "delivery-1",
      "x-hub-signature-256": `sha256=${signature}`,
    },
    body,
  });
}

describe("GitHub webhook route", () => {
  it("verifies a known signature with a timing-safe comparison", () => {
    const body = JSON.stringify(pullRequestPayload);
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyGitHubSignature(body, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyGitHubSignature(`${body}tampered`, `sha256=${signature}`, secret)).toBe(false);
  });

  it("rejects a bad signature before parsing the body", async () => {
    const response = await handleGitHubWebhook(
      new Request("http://localhost/api/webhooks/github", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=bad" },
        body: "not-json",
      }),
      secret,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      data: null,
      error: "Invalid webhook signature.",
    });
  });

  it("validates and dispatches pull request events", async () => {
    const handlePullRequest = vi.fn();
    const response = await handleGitHubWebhook(
      signedRequest(JSON.stringify(pullRequestPayload)),
      secret,
      {
        handlePullRequest,
        handlePullRequestReviewComment: vi.fn(),
        handleIssueComment: vi.fn(),
        handleInstallation: vi.fn(),
        handleInstallationRepos: vi.fn(),
      },
    );

    expect(response.status).toBe(200);
    expect(handlePullRequest).toHaveBeenCalledWith(pullRequestPayload, "delivery-1");
  });

  it("returns 400 for a signed payload with an invalid shape", async () => {
    const response = await handleGitHubWebhook(
      signedRequest(JSON.stringify({ action: "opened" })),
      secret,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid webhook payload.",
    });
  });

  it("ignores valid but unsupported event types", async () => {
    const response = await handleGitHubWebhook(
      signedRequest(JSON.stringify({ zen: "Keep it logically awesome." }), "ping"),
      secret,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { dispatched: false, ignored: true },
      error: null,
    });
  });

  it("validates and dispatches pull_request_review_comment events", async () => {
    const handlePullRequestReviewComment = vi.fn();
    const payload = {
      action: "created",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo" },
      pull_request: {
        number: 7,
        user: { login: "author", type: "User" },
      },
      comment: {
        id: 9001,
        body: "@diffguard valid",
        user: { login: "reviewer", type: "User" },
        in_reply_to_id: 7001,
      },
    };

    const response = await handleGitHubWebhook(
      signedRequest(JSON.stringify(payload), "pull_request_review_comment"),
      secret,
      {
        handlePullRequest: vi.fn(),
        handlePullRequestReviewComment,
        handleIssueComment: vi.fn(),
        handleInstallation: vi.fn(),
        handleInstallationRepos: vi.fn(),
      },
    );

    expect(response.status).toBe(200);
    expect(handlePullRequestReviewComment).toHaveBeenCalledWith(
      payload,
      "delivery-1",
    );
  });

  it("validates and dispatches issue_comment events", async () => {
    const handleIssueComment = vi.fn();
    const payload = {
      action: "created",
      installation: { id: 42 },
      repository: { id: 100, full_name: "owner/repo" },
      issue: {
        number: 7,
        pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/7" },
        user: { login: "author", type: "User" },
      },
      comment: {
        id: 9001,
        body: "@diffguard explain auth",
        user: { login: "reviewer", type: "User" },
      },
    };

    const response = await handleGitHubWebhook(
      signedRequest(JSON.stringify(payload), "issue_comment"),
      secret,
      {
        handlePullRequest: vi.fn(),
        handlePullRequestReviewComment: vi.fn(),
        handleIssueComment,
        handleInstallation: vi.fn(),
        handleInstallationRepos: vi.fn(),
      },
    );

    expect(response.status).toBe(200);
    expect(handleIssueComment).toHaveBeenCalledWith(payload, "delivery-1");
  });

  it("returns 400 for a signed but malformed review comment payload", async () => {
    const response = await handleGitHubWebhook(
      signedRequest(
        JSON.stringify({ action: "created", comment: { id: 1 } }),
        "pull_request_review_comment",
      ),
      secret,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid webhook payload.",
    });
  });
});
