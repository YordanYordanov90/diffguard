import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { DEFAULT_MODEL } from "../config/constants";

/** Stored suggested-change shape; revalidated at the write boundary. */
export type StoredSuggestedChange = {
  startLine: number;
  endLine: number;
  replacement: string;
};

export const reviewStatusEnum = pgEnum("review_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const skipReasonEnum = pgEnum("skip_reason", [
  "draft",
  "bot_author",
  "skip_keyword",
  "daily_cap",
  "rate_limited",
  "stale_sha",
]);

export type SkipReason = (typeof skipReasonEnum.enumValues)[number];

export const verdictEnum = pgEnum("verdict", ["approve", "comment", "concerns"]);

export const reviewModeEnum = pgEnum("review_mode", [
  "full",
  "incremental",
  "fallback_full",
]);

export type ReviewMode = (typeof reviewModeEnum.enumValues)[number];
export const severityEnum = pgEnum("severity", [
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const categoryEnum = pgEnum("category", [
  "security",
  "bug",
  "quality",
  "performance",
]);

export const findingConfidenceEnum = pgEnum("finding_confidence", [
  "low",
  "medium",
  "high",
]);

export const findingLifecycleEnum = pgEnum("finding_lifecycle", [
  "open",
  "resolved",
  "dismissed",
]);

export type FindingLifecycle = (typeof findingLifecycleEnum.enumValues)[number];
export type FindingConfidence = (typeof findingConfidenceEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type Category = (typeof categoryEnum.enumValues)[number];

export const installations = pgTable("installations", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  model: text("model").notNull().default(DEFAULT_MODEL),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const repositories = pgTable("repositories", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  installationId: bigint("installation_id", { mode: "number" })
    .notNull()
    .references(() => installations.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    repositoryId: bigint("repository_id", { mode: "number" })
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    headSha: text("head_sha").notNull(),
    status: reviewStatusEnum("status").notNull().default("queued"),
    skipReason: skipReasonEnum("skip_reason"),
    verdict: verdictEnum("verdict"),
    reviewMode: reviewModeEnum("review_mode").notNull().default("full"),
    comparedFromSha: text("compared_from_sha"),
    reviewMarkdown: text("review_markdown"),
    commentId: bigint("comment_id", { mode: "number" }),
    findingsCritical: integer("findings_critical").notNull().default(0),
    findingsHigh: integer("findings_high").notNull().default(0),
    findingsMedium: integer("findings_medium").notNull().default(0),
    findingsLow: integer("findings_low").notNull().default(0),
    findingsInfo: integer("findings_info").notNull().default(0),
    candidateFindings: integer("candidate_findings").notNull().default(0),
    rejectedFindings: integer("rejected_findings").notNull().default(0),
    manualCheckCandidates: integer("manual_check_candidates").notNull().default(0),
    adjudicationModel: text("adjudication_model"),
    adjudicationDurationMs: integer("adjudication_duration_ms"),
    skippedFiles: text("skipped_files")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("reviews_repository_pr_head_unique").on(
      table.repositoryId,
      table.prNumber,
      table.headSha,
    ),
    index("reviews_installation_created_at_idx").on(
      table.installationId,
      table.createdAt,
    ),
  ],
);

export const reviewFindings = pgTable(
  "review_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    repositoryId: bigint("repository_id", { mode: "number" })
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: findingLifecycleEnum("status").notNull().default("open"),
    confidence: findingConfidenceEnum("confidence").notNull(),
    severity: severityEnum("severity").notNull(),
    category: categoryEnum("category").notNull(),
    file: text("file").notNull(),
    line: integer("line"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    observedBehavior: text("observed_behavior").notNull(),
    causalPath: text("causal_path").notNull(),
    violatedInvariant: text("violated_invariant").notNull(),
    suggestion: text("suggestion"),
    suggestedChange: jsonb("suggested_change").$type<StoredSuggestedChange | null>(),
    introducedReviewId: uuid("introduced_review_id")
      .notNull()
      .references(() => reviews.id),
    lastReviewId: uuid("last_review_id")
      .notNull()
      .references(() => reviews.id),
    introducedSha: text("introduced_sha").notNull(),
    lastSeenSha: text("last_seen_sha").notNull(),
    resolvedSha: text("resolved_sha"),
    previousResolvedSha: text("previous_resolved_sha"),
    githubCommentId: bigint("github_comment_id", { mode: "number" }),
    resolutionRepliedAt: timestamp("resolution_replied_at", {
      withTimezone: true,
      mode: "date",
    }),
    previousResolutionRepliedAt: timestamp("previous_resolution_replied_at", {
      withTimezone: true,
      mode: "date",
    }),
    resolutionReplyClaimedAt: timestamp("resolution_reply_claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    resolutionReplyAttemptId: uuid("resolution_reply_attempt_id"),
    resolutionReplyCommentId: bigint("resolution_reply_comment_id", {
      mode: "number",
    }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("review_findings_repository_pr_fingerprint_unique").on(
      table.repositoryId,
      table.prNumber,
      table.fingerprint,
    ),
    index("review_findings_tenant_pr_status_idx").on(
      table.installationId,
      table.repositoryId,
      table.prNumber,
      table.status,
    ),
  ],
);
