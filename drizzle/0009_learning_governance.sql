CREATE TYPE "public"."learning_audit_action" AS ENUM('edited', 'archived', 'reactivated');--> statement-breakpoint
CREATE TABLE "repository_learning_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"actor_login" text NOT NULL,
	"action" "learning_audit_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_learnings" ADD COLUMN "last_modified_by" text;--> statement-breakpoint
ALTER TABLE "repository_learnings" ADD COLUMN "last_modified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repository_learnings" ADD COLUMN "last_action" "learning_audit_action";--> statement-breakpoint
ALTER TABLE "repository_learning_audits" ADD CONSTRAINT "repository_learning_audits_learning_id_repository_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."repository_learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_learning_audits" ADD CONSTRAINT "repository_learning_audits_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_learning_audits" ADD CONSTRAINT "repository_learning_audits_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repository_learning_audits_learning_created_idx" ON "repository_learning_audits" USING btree ("learning_id","created_at");--> statement-breakpoint
CREATE INDEX "repository_learning_audits_tenant_repo_idx" ON "repository_learning_audits" USING btree ("installation_id","repository_id");