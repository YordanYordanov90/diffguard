import { Client } from "@upstash/qstash";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import {
  CONVERSATION_ACTOR_RATE_LIMIT,
  CONVERSATION_INSTALLATION_RATE_LIMIT,
  CONVERSATION_PR_RATE_LIMIT,
  DAILY_CONVERSATION_CAP,
} from "@/lib/config/constants";
import { parseEnv } from "@/lib/config/env";
import type { ConversationJob } from "@/lib/review/conversation-job";
import { isDiffguardConversationMention } from "@/lib/review/conversation-mention";
import {
  issueCommentIsPullRequest,
  type IssueCommentEvent,
} from "./events";

type RateLimiter = {
  limit: (identifier: string) => Promise<{ success: boolean }>;
};

type QStashPublisher = {
  publishJSON: (request: {
    url: string;
    body: ConversationJob;
  }) => Promise<unknown>;
};

type ConversationQueries = {
  createQueuedInteraction: (input: {
    installationId: number;
    repositoryId: number;
    prNumber: number;
    sourceCommentId: number;
  }) => Promise<{
    interaction: { id: string; status: string } | null;
    created: boolean;
    reason?: "daily_cap";
  }>;
  createSkippedInteraction: (input: {
    installationId: number;
    repositoryId: number;
    prNumber: number;
    sourceCommentId: number;
    error: string;
  }) => Promise<{
    interaction: { id: string; status: string } | null;
    created: boolean;
  }>;
  countConversationsToday: (installationId: number) => Promise<number>;
};

export type ConversationTriggerDependencies = {
  queries: ConversationQueries;
  installationRateLimiter: RateLimiter;
  prRateLimiter: RateLimiter;
  actorRateLimiter: RateLimiter;
  qstash: QStashPublisher;
  conversationWorkerUrl: string;
};

export type ConversationTriggerResult =
  | { status: "ignored" }
  | { status: "duplicate" }
  | { status: "skipped"; reason: string }
  | { status: "queued" };

type WorkerEnvironment = {
  [key: string]: string | undefined;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

export function getConversationWorkerUrl(
  environment: WorkerEnvironment = process.env,
) {
  const host =
    environment.VERCEL_ENV === "production"
      ? environment.VERCEL_PROJECT_PRODUCTION_URL ?? environment.VERCEL_URL
      : environment.VERCEL_URL;
  const baseUrl = host ? `https://${host}` : "http://localhost:3000";
  return `${baseUrl}/api/jobs/conversation`;
}

function createDefaultDependencies(): ConversationTriggerDependencies {
  const env = parseEnv();
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  const qstash = new Client({ token: env.QSTASH_TOKEN });

  return {
    queries: {
      async createQueuedInteraction(input) {
        const { createQueuedInteraction } = await import("@/lib/db/queries");
        return createQueuedInteraction(input);
      },
      async createSkippedInteraction(input) {
        const { createSkippedInteraction } = await import("@/lib/db/queries");
        return createSkippedInteraction(input);
      },
      async countConversationsToday(installationId) {
        const { countConversationsToday } = await import("@/lib/db/queries");
        return countConversationsToday(installationId);
      },
    },
    installationRateLimiter: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(CONVERSATION_INSTALLATION_RATE_LIMIT, "1 m"),
      prefix: "diffguard:conversation:installation",
    }),
    prRateLimiter: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(CONVERSATION_PR_RATE_LIMIT, "1 m"),
      prefix: "diffguard:conversation:pr",
    }),
    actorRateLimiter: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(CONVERSATION_ACTOR_RATE_LIMIT, "1 m"),
      prefix: "diffguard:conversation:actor",
    }),
    qstash: {
      publishJSON: (request) => qstash.publishJSON(request),
    },
    conversationWorkerUrl: getConversationWorkerUrl(),
  };
}

function isBotAuthor(type: string) {
  return type.toLowerCase() === "bot";
}

/**
 * Fast-path filter for issue_comment events on pull requests.
 * Permission re-check and thread fetch happen in the signed worker.
 */
export function createConversationTriggerHandler(
  dependencies: ConversationTriggerDependencies = createDefaultDependencies(),
) {
  return async function handleIssueComment(
    event: IssueCommentEvent,
    deliveryId: string,
  ): Promise<ConversationTriggerResult> {
    if (event.action !== "created") return { status: "ignored" };
    if (!issueCommentIsPullRequest(event)) return { status: "ignored" };
    if (isBotAuthor(event.comment.user.type)) return { status: "ignored" };
    if (!isDiffguardConversationMention(event.comment.body)) {
      return { status: "ignored" };
    }

    const installationId = event.installation.id;
    const repositoryId = event.repository.id;
    const prNumber = event.issue.number;
    const sourceCommentId = event.comment.id;
    const actorLogin = event.comment.user.login;

    const baseInput = {
      installationId,
      repositoryId,
      prNumber,
      sourceCommentId,
    };

    const publishQueuedInteraction = async (interactionId: string) => {
      const job: ConversationJob = {
        installationId,
        repositoryId,
        repoFullName: event.repository.full_name,
        prNumber,
        sourceCommentId,
        actorLogin,
        prAuthorLogin: event.issue.user.login,
        deliveryId,
        interactionId,
      };

      try {
        await dependencies.qstash.publishJSON({
          url: dependencies.conversationWorkerUrl,
          body: job,
        });
      } catch {
        // Leave queued for another webhook redelivery/manual recovery.
        throw new Error("Conversation job publish failed.");
      }

      return { status: "queued" as const };
    };

    const conversationsToday =
      await dependencies.queries.countConversationsToday(installationId);
    if (conversationsToday >= DAILY_CONVERSATION_CAP) {
      const skipped = await dependencies.queries.createSkippedInteraction({
        ...baseInput,
        error: "daily_cap",
      });
      if (skipped.interaction?.status === "queued") {
        return publishQueuedInteraction(skipped.interaction.id);
      }
      return { status: "skipped", reason: "daily_cap" };
    }

    const [installationLimit, prLimit, actorLimit] = await Promise.all([
      dependencies.installationRateLimiter.limit(String(installationId)),
      dependencies.prRateLimiter.limit(`${installationId}:${repositoryId}:${prNumber}`),
      dependencies.actorRateLimiter.limit(
        `${installationId}:${actorLogin.toLowerCase()}`,
      ),
    ]);

    if (!installationLimit.success || !prLimit.success || !actorLimit.success) {
      const skipped = await dependencies.queries.createSkippedInteraction({
        ...baseInput,
        error: "rate_limited",
      });
      if (skipped.interaction?.status === "queued") {
        return publishQueuedInteraction(skipped.interaction.id);
      }
      return { status: "skipped", reason: "rate_limited" };
    }

    const queued = await dependencies.queries.createQueuedInteraction(baseInput);
    if (queued.reason === "daily_cap") {
      const skipped = await dependencies.queries.createSkippedInteraction({
        ...baseInput,
        error: "daily_cap",
      });
      if (skipped.interaction?.status === "queued") {
        return publishQueuedInteraction(skipped.interaction.id);
      }
      return { status: "skipped", reason: "daily_cap" };
    }
    if (!queued.interaction) return { status: "ignored" };
    if (!queued.created && queued.interaction.status !== "queued") {
      return { status: "duplicate" };
    }

    return publishQueuedInteraction(queued.interaction.id);
  };
}

let defaultHandler: ReturnType<typeof createConversationTriggerHandler> | undefined;

export async function handleIssueComment(
  event: IssueCommentEvent,
  deliveryId: string,
) {
  defaultHandler ??= createConversationTriggerHandler();
  return defaultHandler(event, deliveryId);
}
