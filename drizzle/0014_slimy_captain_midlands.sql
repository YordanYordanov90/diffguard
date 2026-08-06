ALTER TABLE "reviews" ADD COLUMN "security_verification_candidates" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_verified" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_downgraded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_rejected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_manual" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_model" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "security_verification_duration_ms" integer;