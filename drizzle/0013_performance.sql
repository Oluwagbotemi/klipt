CREATE TABLE "web_vitals_daily" (
	"site_id" text NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"metric" text NOT NULL,
	"device" text NOT NULL,
	"bucket" integer NOT NULL,
	"count" integer NOT NULL,
	"sum" double precision NOT NULL,
	CONSTRAINT "web_vitals_daily_site_id_day_path_metric_device_bucket_pk" PRIMARY KEY("site_id","day","path","metric","device","bucket")
);
--> statement-breakpoint
CREATE TABLE "web_vitals_usage" (
	"site_id" text NOT NULL,
	"day" date NOT NULL,
	"samples" integer NOT NULL,
	CONSTRAINT "web_vitals_usage_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "vitals_key" text;--> statement-breakpoint
ALTER TABLE "web_vitals_daily" ADD CONSTRAINT "web_vitals_daily_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_vitals_usage" ADD CONSTRAINT "web_vitals_usage_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_vitals_daily_site_day_idx" ON "web_vitals_daily" USING btree ("site_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_vitals_key_unique" ON "sites" USING btree ("vitals_key") WHERE "sites"."vitals_key" is not null;