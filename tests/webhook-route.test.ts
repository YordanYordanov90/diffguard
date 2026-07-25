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
});
