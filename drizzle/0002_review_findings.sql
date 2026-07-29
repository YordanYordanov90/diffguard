CREATE TYPE "public"."category" AS ENUM('security', 'bug', 'quality', 'performance');--> statement-breakpoint
CREATE TYPE "public"."finding_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."finding_lifecycle" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TABLE "review_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "finding_lifecycle" DEFAULT 'open' NOT NULL,
	"confidence" "finding_confidence" NOT NULL,
	"severity" "severity" NOT NULL,
	"category" "category" NOT NULL,
	"file" text NOT NULL,
	"line" integer,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"observed_behavior" text NOT NULL,
	"causal_path" text NOT NULL,
	"violated_invariant" text NOT NULL,
	"suggestion" text,
	"suggested_change" jsonb,
	"introduced_review_id" uuid NOT NULL,
	"last_review_id" uuid NOT NULL,
	"introduced_sha" text NOT NULL,
	"last_seen_sha" text NOT NULL,
	"resolved_sha" text,
	"github_comment_id" bigint,
	"resolution_replied_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_findings_repository_pr_fingerprint_unique" UNIQUE("repository_id","pr_number","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_introduced_review_id_reviews_id_fk" FOREIGN KEY ("introduced_review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_last_review_id_reviews_id_fk" FOREIGN KEY ("last_review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_findings_tenant_pr_status_idx" ON "review_findings" USING btree ("installation_id","repository_id","pr_number","status");