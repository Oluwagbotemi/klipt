ALTER TABLE "audit_events" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "review_feedback" jsonb;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_entries_site_assignee_idx" ON "content_entries" USING btree ("site_id","assignee_id");