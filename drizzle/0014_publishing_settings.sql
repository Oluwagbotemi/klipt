ALTER TABLE "content_entries" ADD COLUMN "review_requested_by_id" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "url_patterns" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "require_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "default_model_key" text;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_review_requested_by_id_users_id_fk" FOREIGN KEY ("review_requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;