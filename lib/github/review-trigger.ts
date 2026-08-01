import { Client } from "@upstash/qstash";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { ReviewJob } from "@/lib/review/job";
import type { PullRequestEvent } from "./events";
import {
  DEBOUNCE_SECONDS,
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
  requeueReview: (installationId: number, reviewId: string) => Promise<unknown>;
  countReviewsToday: (installationId: number) => Promise<number>;
  isPrReviewPaused: (
    installationId: number,
    repositoryId: number,
    prNumber: number,
  ) => Promise<boolean>;
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

type ReviewWorkerEnvironment = {
  [key: string]: string | undefined;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

export function getReviewWorkerUrl(
  environment: ReviewWorkerEnvironment = process.env,
) {
  const host =
    environment.VERCEL_ENV === "production"
      ? environment.VERCEL_PROJECT_PRODUCTION_URL ?? environment.VERCEL_URL
      : environment.VERCEL_URL;
  const baseUrl = host ? `https://${host}` : "http://localhost:3000";
  return `${baseUrl}/api/jobs/review`;
}

function createDefaultDependencies(): ReviewTriggerDependencies {
  const env = parseEnv();
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  const qstash = new Client({ token: env.QSTASH_TOKEN });

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
      async requeueReview(installationId, reviewId) {
        const { requeueReview } = await import("@/lib/db/queries");
        return requeueReview(installationId, reviewId);
      },
      async countReviewsToday(installationId) {
        const { countReviewsToday } = await import("@/lib/db/queries");
        return countReviewsToday(installationId);
      },
      async isPrReviewPaused(installationId, repositoryId, prNumber) {
        const { isPrReviewPaused } = await import("@/lib/db/queries");
        return isPrReviewPaused(installationId, repositoryId, prNumber);
      },
    },
    rateLimiter: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT, "1 m"),
    }),
    qstash: {
      publishJSON: (request) => qstash.publishJSON(request),
    },
    reviewWorkerUrl: getReviewWorkerUrl(),
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

    // Feature 34: collaborators can pause automatic reviews for this PR.
    // Manual @diffguard review / full review still enqueue outside this path.
    const paused = await dependencies.queries.isPrReviewPaused(
      installationId,
      event.repository.id,
      event.pull_request.number,
    );
    if (paused) return { status: "ignored" };

    const job: ReviewJob = {
      installationId,
      repositoryId: event.repository.id,
      repoFullName: target.repoFullName,
      prNumber: event.pull_request.number,
      prTitle: event.pull_request.title,
      prBody: event.pull_request.body,
      headSha: event.pull_request.head.sha,
      deliveryId,
      // Webhooks never force a full review; Feature 34 sets this internally.
      forceFullReview: false,
    };
    const skipReason = getSkipReason(event);
    if (skipReason) {
      const queued = await dependencies.queries.createQueuedReview(job);
      if (!queued.created || !queued.review) return { status: "duplicate" };
      await dependencies.queries.markReviewSkipped(
        installationId,
        queued.review.id,
        skipReason,
      );
      return { status: "skipped", reason: skipReason };
    }

    const rateLimit = await dependencies.rateLimiter.limit(`installation:${installationId}`);
    if (!rateLimit.success) {
      const queued = await dependencies.queries.createQueuedReview(job);
      if (!queued.created || !queued.review) return { status: "duplicate" };
      await dependencies.queries.markReviewSkipped(
        installationId,
        queued.review.id,
        "rate_limited",
      );
      return { status: "skipped", reason: "rate_limited" };
    }

    const queued = await dependencies.queries.createQueuedReview({
      ...job,
      enforceDailyCap: true,
    });
    if (queued.reason === "daily_cap") {
      return { status: "skipped", reason: "daily_cap" };
    }
    if (!queued.review) return { status: "duplicate" };

    if (!queued.created) {
      if (
        event.action === "ready_for_review" &&
        queued.review.status === "skipped" &&
        queued.review.skipReason === "draft"
      ) {
        const requeued = await dependencies.queries.requeueReview(
          installationId,
          queued.review.id,
        );
        if (!requeued) return { status: "duplicate" };
      } else if (queued.review.status !== "queued") {
        return { status: "duplicate" };
      }
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
