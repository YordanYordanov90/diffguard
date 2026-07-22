import { Client } from "@upstash/qstash";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { ReviewJob } from "@/lib/review/job";
import type { PullRequestEvent } from "./events";
import {
  DEBOUNCE_SECONDS,
  DAILY_REVIEW_CAP,
  RATE_LIMIT,
} from "@/lib/config/constants";
import { parseEnv } from "@/lib/config/env";
import type {
  QueuedReviewInput,
  QueuedReviewResult,
  ReviewTarget,
} from "@/lib/db/queries";
import type { SkipReason } from "@/lib/db/schema";

type RateLimiter = {
  limit: (identifier: string) => Promise<{ success: boolean }>;
};

type QStashPublisher = {
  publishJSON: (request: {
    url: string;
    body: ReviewJob;
    delay: number;
  }) => Promise<unknown>;
};

type ReviewQueries = {
  getReviewTarget: (installationId: number, repositoryId: number) => Promise<ReviewTarget | null>;
  createQueuedReview: (input: QueuedReviewInput) => Promise<QueuedReviewResult>;
  markReviewSkipped: (
    installationId: number,
    reviewId: string,
    skipReason: SkipReason,
  ) => Promise<unknown>;
  countReviewsToday: (installationId: number) => Promise<number>;
};

export type ReviewTriggerDependencies = {
  queries: ReviewQueries;
  rateLimiter: RateLimiter;
  qstash: QStashPublisher;
  reviewWorkerUrl: string;
};

export type ReviewTriggerResult =
  | { status: "ignored" | "duplicate" }
  | { status: "skipped"; reason: SkipReason }
  | { status: "queued" };

function createDefaultDependencies(): ReviewTriggerDependencies {
  const env = parseEnv();
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  const qstash = new Client({ token: env.QSTASH_TOKEN });
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  return {
    queries: {
      async getReviewTarget(installationId, repositoryId) {
        const { getReviewTarget } = await import("@/lib/db/queries");
        return getReviewTarget(installationId, repositoryId);
      },
      async createQueuedReview(input) {
        const { createQueuedReview } = await import("@/lib/db/queries");
        return createQueuedReview(input);
      },
      async markReviewSkipped(installationId, reviewId, skipReason) {
        const { markReviewSkipped } = await import("@/lib/db/queries");
        return markReviewSkipped(installationId, reviewId, skipReason);
      },
      async countReviewsToday(installationId) {
        const { countReviewsToday } = await import("@/lib/db/queries");
        return countReviewsToday(installationId);
      },
    },
    rateLimiter: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT, "1 m"),
    }),
    qstash: {
      publishJSON: (request) => qstash.publishJSON(request),
    },
    reviewWorkerUrl: `${baseUrl}/api/jobs/review`,
  };
}

function getSkipReason(event: PullRequestEvent): SkipReason | null {
  if (event.pull_request.draft) return "draft";
  if (event.pull_request.user.type === "Bot") return "bot_author";
  if (/\[skip-review\]/i.test(event.pull_request.title)) return "skip_keyword";
  return null;
}

function isReviewAction(action: string) {
  return action === "opened" || action === "synchronize" || action === "ready_for_review";
}

export function createReviewTriggerHandler(
  dependencies: ReviewTriggerDependencies = createDefaultDependencies(),
) {
  return async function handlePullRequest(
    event: PullRequestEvent,
    deliveryId: string,
  ): Promise<ReviewTriggerResult> {
    if (!isReviewAction(event.action)) return { status: "ignored" };

    const installationId = event.installation.id;
    const target = await dependencies.queries.getReviewTarget(
      installationId,
      event.repository.id,
    );
    if (!target || target.suspended || !target.enabled) return { status: "ignored" };

    const job: ReviewJob = {
      installationId,
      repositoryId: event.repository.id,
      repoFullName: target.repoFullName,
      prNumber: event.pull_request.number,
      headSha: event.pull_request.head.sha,
      deliveryId,
    };
    const queued = await dependencies.queries.createQueuedReview(job);
    if (!queued.created || !queued.review) return { status: "duplicate" };

    const skipReason = getSkipReason(event);
    if (skipReason) {
      await dependencies.queries.markReviewSkipped(
        installationId,
        queued.review.id,
        skipReason,
      );
      return { status: "skipped", reason: skipReason };
    }

    const rateLimit = await dependencies.rateLimiter.limit(`installation:${installationId}`);
    if (!rateLimit.success) {
      await dependencies.queries.markReviewSkipped(
        installationId,
        queued.review.id,
        "rate_limited",
      );
      return { status: "skipped", reason: "rate_limited" };
    }

    const reviewsToday = await dependencies.queries.countReviewsToday(installationId);
    if (reviewsToday >= DAILY_REVIEW_CAP) {
      await dependencies.queries.markReviewSkipped(
        installationId,
        queued.review.id,
        "daily_cap",
      );
      return { status: "skipped", reason: "daily_cap" };
    }

    await dependencies.qstash.publishJSON({
      url: dependencies.reviewWorkerUrl,
      body: job,
      delay: DEBOUNCE_SECONDS,
    });
    return { status: "queued" };
  };
}

let defaultHandler: ReturnType<typeof createReviewTriggerHandler> | undefined;

export async function handlePullRequest(event: PullRequestEvent, deliveryId: string) {
  defaultHandler ??= createReviewTriggerHandler();
  return defaultHandler(event, deliveryId);
}
