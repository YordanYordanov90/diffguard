import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { DEFAULT_MODEL } from "../config/constants";

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
    reviewMarkdown: text("review_markdown"),
    commentId: bigint("comment_id", { mode: "number" }),
    findingsCritical: integer("findings_critical").notNull().default(0),
    findingsHigh: integer("findings_high").notNull().default(0),
    findingsMedium: integer("findings_medium").notNull().default(0),
    findingsLow: integer("findings_low").notNull().default(0),
    findingsInfo: integer("findings_info").notNull().default(0),
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
