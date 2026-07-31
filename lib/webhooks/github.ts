import { createHmac, timingSafeEqual } from "node:crypto";

import {
  installationEventSchema,
  installationRepositoriesEventSchema,
  issueCommentEventSchema,
  pullRequestEventSchema,
  pullRequestReviewCommentEventSchema,
  type InstallationEvent,
  type InstallationRepositoriesEvent,
  type IssueCommentEvent,
  type PullRequestEvent,
  type PullRequestReviewCommentEvent,
} from "@/lib/github/events";
import {
  handleInstallation,
  handleInstallationRepos,
} from "@/lib/github/webhook-handlers";
import { handlePullRequest } from "@/lib/github/review-trigger";
import { handlePullRequestReviewComment } from "@/lib/github/feedback-trigger";
import { handleIssueComment } from "@/lib/github/conversation-trigger";

export type WebhookHandlers = {
  handlePullRequest: (event: PullRequestEvent, deliveryId: string) => void | Promise<void>;
  handlePullRequestReviewComment: (
    event: PullRequestReviewCommentEvent,
    deliveryId: string,
  ) => void | Promise<void>;
  handleIssueComment: (
    event: IssueCommentEvent,
    deliveryId: string,
  ) => void | Promise<void>;
  handleInstallation: (event: InstallationEvent, deliveryId: string) => void | Promise<void>;
  handleInstallationRepos: (
    event: InstallationRepositoriesEvent,
    deliveryId: string,
  ) => void | Promise<void>;
};

const defaultHandlers: WebhookHandlers = {
  handlePullRequest: async (event, deliveryId) => {
    await handlePullRequest(event, deliveryId);
  },
  handlePullRequestReviewComment: async (event, deliveryId) => {
    await handlePullRequestReviewComment(event, deliveryId);
  },
  handleIssueComment: async (event, deliveryId) => {
    await handleIssueComment(event, deliveryId);
  },
  handleInstallation,
  handleInstallationRepos,
};

function envelope(
  success: boolean,
  data: unknown,
  error: string | null,
  status: number,
) {
  return Response.json({ success, data, error }, { status });
}

export function verifyGitHubSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
    "utf8",
  );
  const received = Buffer.from(signature, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function parseEvent(eventName: string, payload: unknown) {
  switch (eventName) {
    case "pull_request":
      return { kind: eventName, event: pullRequestEventSchema.parse(payload) };
    case "pull_request_review_comment":
      return {
        kind: eventName,
        event: pullRequestReviewCommentEventSchema.parse(payload),
      };
    case "issue_comment":
      return {
        kind: eventName,
        event: issueCommentEventSchema.parse(payload),
      };
    case "installation":
      return { kind: eventName, event: installationEventSchema.parse(payload) };
    case "installation_repositories":
      return {
        kind: eventName,
        event: installationRepositoriesEventSchema.parse(payload),
      };
    default:
      return null;
  }
}

async function dispatch(
  eventName: string,
  payload: unknown,
  deliveryId: string,
  handlers: WebhookHandlers,
) {
  const parsed = parseEvent(eventName, payload);
  if (!parsed) return false;

  if (parsed.kind === "pull_request") {
    await handlers.handlePullRequest(parsed.event, deliveryId);
  } else if (parsed.kind === "pull_request_review_comment") {
    await handlers.handlePullRequestReviewComment(parsed.event, deliveryId);
  } else if (parsed.kind === "issue_comment") {
    await handlers.handleIssueComment(parsed.event, deliveryId);
  } else if (parsed.kind === "installation") {
    await handlers.handleInstallation(parsed.event, deliveryId);
  } else {
    await handlers.handleInstallationRepos(parsed.event, deliveryId);
  }

  return true;
}

export async function handleGitHubWebhook(
  request: Request,
  webhookSecret: string,
  handlers: WebhookHandlers = defaultHandlers,
) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
    return envelope(false, null, "Invalid webhook signature.", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return envelope(false, null, "Invalid webhook payload.", 400);
  }

  const eventName = request.headers.get("x-github-event") ?? "";
  const deliveryId = request.headers.get("x-github-delivery") ?? "unknown";
  let parsedEvent: ReturnType<typeof parseEvent>;
  try {
    parsedEvent = parseEvent(eventName, payload);
  } catch {
    return envelope(false, null, "Invalid webhook payload.", 400);
  }

  if (!parsedEvent) {
    return envelope(true, { dispatched: false, ignored: true }, null, 200);
  }

  try {
    await dispatch(eventName, parsedEvent.event, deliveryId, handlers);
    return envelope(true, { dispatched: true, ignored: false }, null, 200);
  } catch {
    return envelope(false, null, "Webhook processing failed.", 500);
  }
}


