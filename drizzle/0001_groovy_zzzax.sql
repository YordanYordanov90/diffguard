ALTER TABLE "reviews" ADD COLUMN "candidate_findings" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "rejected_findings" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "manual_check_candidates" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "adjudication_model" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "adjudication_duration_ms" integer;