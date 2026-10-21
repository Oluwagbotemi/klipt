ALTER TABLE "site_invitations" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_assignments" boolean DEFAULT true NOT NULL;