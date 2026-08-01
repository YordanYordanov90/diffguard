ALTER TABLE "pr_review_controls" DROP CONSTRAINT "pr_review_controls_pk";
--> statement-breakpoint
ALTER TABLE "pr_review_controls" ADD CONSTRAINT "pr_review_controls_pk" PRIMARY KEY("installation_id","repository_id","pr_number");