CREATE TYPE "public"."review_status" AS ENUM('queued', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."skip_reason" AS ENUM('draft', 'bot_author', 'skip_keyword', 'daily_cap', 'rate_limited', 'stale_sha');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('approve', 'comment', 'concerns');--> statement-breakpoint
CREATE TABLE "installations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"model" text DEFAULT 'openai/gpt-5.4-mini' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" bigint PRIMARY KEY NOT NULL,
	"installation_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"head_sha" text NOT NULL,
	"status" "review_status" DEFAULT 'queued' NOT NULL,
	"skip_reason" "skip_reason",
	"verdict" "verdict",
	"review_markdown" text,
	"comment_id" bigint,
	"findings_critical" integer DEFAULT 0 NOT NULL,
	"findings_high" integer DEFAULT 0 NOT NULL,
	"findings_medium" integer DEFAULT 0 NOT NULL,
	"findings_low" integer DEFAULT 0 NOT NULL,
	"findings_info" integer DEFAULT 0 NOT NULL,
	"skipped_files" text[] DEFAULT '{}'::text[] NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_repository_pr_head_unique" UNIQUE("repository_id","pr_number","head_sha")
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_installation_created_at_idx" ON "reviews" USING btree ("installation_id","created_at");