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

/** Persisted linked-issue assessment (Feature 29); never includes issue body. */
export type StoredIssueAssessment = {
  issueNumber: number;
  title: string;
  status: "addressed" | "not_addressed" | "unclear";
  rationale: string;
  unmetRequirements: string[];
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

export const feedbackActionEnum = pgEnum("feedback_action", [
  "valid",
  "dismiss",
  "false_positive",
]);

export type FeedbackAction = (typeof feedbackActionEnum.enumValues)[number];

export const learningStatusEnum = pgEnum("learning_status", [
  "active",
  "archived",
]);

export type LearningStatus = (typeof learningStatusEnum.enumValues)[number];

export const learningAuditActionEnum = pgEnum("learning_audit_action", [
  "edited",
  "archived",
  "reactivated",
]);

export type LearningAuditAction =
  (typeof learningAuditActionEnum.enumValues)[number];

export const interactionStatusEnum = pgEnum("interaction_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export type InteractionStatus =
  (typeof interactionStatusEnum.enumValues)[number];

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
    linkedIssueAssessments: jsonb("linked_issue_assessments")
      .$type<StoredIssueAssessment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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

/** Collaborator feedback on a DiffGuard finding (Feature 30). No thread history. */
export const findingFeedback = pgTable(
  "finding_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    repositoryId: bigint("repository_id", { mode: "number" })
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => reviewFindings.id, { onDelete: "cascade" }),
    sourceCommentId: bigint("source_comment_id", { mode: "number" }).notNull(),
    actorLogin: text("actor_login").notNull(),
    action: feedbackActionEnum("action").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("finding_feedback_source_comment_id_unique").on(table.sourceCommentId),
    index("finding_feedback_tenant_pr_idx").on(
      table.installationId,
      table.repositoryId,
      table.prNumber,
    ),
  ],
);

/**
 * Explicit collaborator repository preferences (Feature 31).
 * Never stores source code, diffs, or conversation history.
 */
export const repositoryLearnings = pgTable(
  "repository_learnings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    repositoryId: bigint("repository_id", { mode: "number" })
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    guidance: text("guidance").notNull(),
    contentHash: text("content_hash").notNull(),
    status: learningStatusEnum("status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
    sourceFindingId: uuid("source_finding_id").references(() => reviewFindings.id, {
      onDelete: "set null",
    }),
    sourceCommentId: bigint("source_comment_id", { mode: "number" }),
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    /** Latest governance mutation actor (Feature 32). */
    lastModifiedBy: text("last_modified_by"),
    lastModifiedAt: timestamp("last_modified_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastAction: learningAuditActionEnum("last_action"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("repository_learnings_repository_content_hash_unique").on(
      table.repositoryId,
      table.contentHash,
    ),
    index("repository_learnings_tenant_repo_status_idx").on(
      table.installationId,
      table.repositoryId,
      table.status,
    ),
  ],
);

/** Minimal governance audit trail for learning mutations (Feature 32). */
export const repositoryLearningAudits = pgTable(
  "repository_learning_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningId: uuid("learning_id")
      .notNull()
      .references(() => repositoryLearnings.id, { onDelete: "cascade" }),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    repositoryId: bigint("repository_id", { mode: "number" })
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    actorLogin: text("actor_login").notNull(),
    action: learningAuditActionEnum("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("repository_learning_audits_learning_created_idx").on(
      table.learningId,
      table.createdAt,
    ),
    index("repository_learning_audits_tenant_repo_idx").on(
      table.installationId,
      table.repositoryId,
    ),
  ],
);

/**
 * PR conversation interaction metadata (Feature 33).
 * Never stores question text, answer text, diffs, or source content.
 */
export const prInteractions = pgTable(
  "pr_interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    installationId: bigint("installation_id", { mode: "number" })
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    repositoryId: bigint("repository_id", { mode: "number" })
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    prNumber: integer("pr_number").notNull(),
    sourceCommentId: bigint("source_comment_id", { mode: "number" }).notNull(),
    status: interactionStatusEnum("status").notNull().default("queued"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    /** Safe operational error/skip reason only — never question/answer text. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("pr_interactions_source_comment_id_unique").on(table.sourceCommentId),
    index("pr_interactions_installation_created_at_idx").on(
      table.installationId,
      table.createdAt,
    ),
    index("pr_interactions_tenant_pr_idx").on(
      table.installationId,
      table.repositoryId,
      table.prNumber,
    ),
  ],
);
