ALTER TABLE "users" ADD COLUMN "onboarding_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_building" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;