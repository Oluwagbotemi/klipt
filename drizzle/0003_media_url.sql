ALTER TABLE "media_assets" ADD COLUMN "url" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_unique" ON "media_assets" USING btree ("storage_key");