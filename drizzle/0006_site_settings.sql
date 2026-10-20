ALTER TABLE "site_ownership_transfers" ADD COLUMN "token_encrypted" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "seo_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL;