CREATE TABLE "pr_review_controls" (
	"installation_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pr_review_controls_pk" PRIMARY KEY("installation_id","repository_id","pr_number")
);
--> statement-breakpoint
ALTER TABLE "pr_review_controls" ADD CONSTRAINT "pr_review_controls_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_review_controls" ADD CONSTRAINT "pr_review_controls_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_review_controls_tenant_pr_idx" ON "pr_review_controls" USING btree ("installation_id","repository_id","pr_number");
