import { Client } from "@upstash/qstash";

import { parseEnv } from "@/lib/config/env";
import type { FeedbackJob } from "@/lib/review/feedback-job";
import { parseFeedbackCommand } from "@/lib/review/feedback-command";
import type { PullRequestReviewCommentEvent } from "./events";

type QStashPublisher = {
  publishJSON: (request: {
    url: string;
    body: FeedbackJob;
  }) => Promise<unknown>;
};

export type FeedbackTriggerDependencies = {
  qstash: QStashPublisher;
  feedbackWorkerUrl: string;
};

export type FeedbackTriggerResult =
  | { status: "ignored" }
  | { status: "queued" };

type WorkerEnvironment = {
  [key: string]: string | undefined;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

export function getFeedbackWorkerUrl(
  environment: WorkerEnvironment = process.env,
) {
  const host =
    environment.VERCEL_ENV === "production"
      ? environment.VERCEL_PROJECT_PRODUCTION_URL ?? environment.VERCEL_URL
      : environment.VERCEL_URL;
  const baseUrl = host ? `https://${host}` : "http://localhost:3000";
  return `${baseUrl}/api/jobs/feedback`;
}

function createDefaultDependencies(): FeedbackTriggerDependencies {
  const env = parseEnv();
  const qstash = new Client({ token: env.QSTASH_TOKEN });

  return {
    qstash: {
      publishJSON: (request) => qstash.publishJSON(request),
    },
    feedbackWorkerUrl: getFeedbackWorkerUrl(),
  };
}

function isBotAuthor(type: string) {
  return type.toLowerCase() === "bot";
}

/**
 * Fast-path filter for pull_request_review_comment events.
 * Only recognized commands on newly created human replies are enqueued.
 * Permission checks and finding ownership happen in the signed worker.
 */
export function createFeedbackTriggerHandler(
  dependencies: FeedbackTriggerDependencies = createDefaultDependencies(),
) {
  return async function handlePullRequestReviewComment(
    event: PullRequestReviewCommentEvent,
    deliveryId: string,
  ): Promise<FeedbackTriggerResult> {
    if (event.action !== "created") return { status: "ignored" };

    const parentCommentId = event.comment.in_reply_to_id;
    if (parentCommentId == null) return { status: "ignored" };

    if (isBotAuthor(event.comment.user.type)) return { status: "ignored" };

    const command = parseFeedbackCommand(event.comment.body);
    if (!command) return { status: "ignored" };

    const job: FeedbackJob = {
      installationId: event.installation.id,
      repositoryId: event.repository.id,
      repoFullName: event.repository.full_name,
      prNumber: event.pull_request.number,
      parentCommentId,
      sourceCommentId: event.comment.id,
      actorLogin: event.comment.user.login,
      prAuthorLogin: event.pull_request.user.login,
      action: command.action,
      reason: command.reason,
      deliveryId,
    };

    await dependencies.qstash.publishJSON({
      url: dependencies.feedbackWorkerUrl,
      body: job,
    });

    return { status: "queued" };
  };
}

let defaultHandler: ReturnType<typeof createFeedbackTriggerHandler> | undefined;

export async function handlePullRequestReviewComment(
  event: PullRequestReviewCommentEvent,
  deliveryId: string,
) {
  defaultHandler ??= createFeedbackTriggerHandler();
  return defaultHandler(event, deliveryId);
}
