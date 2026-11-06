ALTER TABLE "sites" ADD COLUMN "logo_media_id" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "favicon_media_id" text;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_logo_media_id_media_assets_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_favicon_media_id_media_assets_id_fk" FOREIGN KEY ("favicon_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;