ALTER TABLE "review_findings" ADD COLUMN "previous_resolved_sha" text;--> statement-breakpoint
ALTER TABLE "review_findings" ADD COLUMN "previous_resolution_replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_findings" ADD COLUMN "resolution_reply_claimed_at" timestamp with time zone;