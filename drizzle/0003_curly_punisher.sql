CREATE TYPE "public"."review_mode" AS ENUM('full', 'incremental', 'fallback_full');--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "review_mode" "review_mode" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "compared_from_sha" text;