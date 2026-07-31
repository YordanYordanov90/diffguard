CREATE TYPE "public"."learning_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "repository_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"guidance" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" "learning_status" DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"source_finding_id" uuid,
	"source_comment_id" bigint,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_learnings_repository_content_hash_unique" UNIQUE("repository_id","content_hash")
);
--> statement-breakpoint
ALTER TABLE "repository_learnings" ADD CONSTRAINT "repository_learnings_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_learnings" ADD CONSTRAINT "repository_learnings_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_learnings" ADD CONSTRAINT "repository_learnings_source_finding_id_review_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."review_findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repository_learnings_tenant_repo_status_idx" ON "repository_learnings" USING btree ("installation_id","repository_id","status");