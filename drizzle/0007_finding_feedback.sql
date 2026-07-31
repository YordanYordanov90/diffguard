CREATE TYPE "public"."feedback_action" AS ENUM('valid', 'dismiss', 'false_positive');--> statement-breakpoint
CREATE TABLE "finding_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"finding_id" uuid NOT NULL,
	"source_comment_id" bigint NOT NULL,
	"actor_login" text NOT NULL,
	"action" "feedback_action" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_feedback_source_comment_id_unique" UNIQUE("source_comment_id")
);
--> statement-breakpoint
ALTER TABLE "finding_feedback" ADD CONSTRAINT "finding_feedback_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_feedback" ADD CONSTRAINT "finding_feedback_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_feedback" ADD CONSTRAINT "finding_feedback_finding_id_review_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."review_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_feedback_tenant_pr_idx" ON "finding_feedback" USING btree ("installation_id","repository_id","pr_number");