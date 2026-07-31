CREATE TYPE "public"."interaction_status" AS ENUM('queued', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "pr_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"source_comment_id" bigint NOT NULL,
	"status" "interaction_status" DEFAULT 'queued' NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pr_interactions_source_comment_id_unique" UNIQUE("source_comment_id")
);
--> statement-breakpoint
ALTER TABLE "pr_interactions" ADD CONSTRAINT "pr_interactions_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_interactions" ADD CONSTRAINT "pr_interactions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_interactions_installation_created_at_idx" ON "pr_interactions" USING btree ("installation_id","created_at");--> statement-breakpoint
CREATE INDEX "pr_interactions_tenant_pr_idx" ON "pr_interactions" USING btree ("installation_id","repository_id","pr_number");