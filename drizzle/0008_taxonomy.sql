CREATE TABLE "entry_terms" (
	"entry_id" text NOT NULL,
	"term_id" text NOT NULL,
	"site_id" text NOT NULL,
	CONSTRAINT "entry_terms_entry_id_term_id_pk" PRIMARY KEY("entry_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"hierarchical" boolean DEFAULT false NOT NULL,
	"model_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"taxonomy_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"parent_id" text,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_terms" ADD CONSTRAINT "entry_terms_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_terms" ADD CONSTRAINT "entry_terms_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_terms" ADD CONSTRAINT "entry_terms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_parent_id_terms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_terms_term_idx" ON "entry_terms" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomies_site_key_unique" ON "taxonomies" USING btree ("site_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_taxonomy_slug_unique" ON "terms" USING btree ("taxonomy_id","slug");--> statement-breakpoint
CREATE INDEX "terms_parent_idx" ON "terms" USING btree ("parent_id");--> statement-breakpoint
-- Every existing site gets the system Categories and Tags taxonomies.
INSERT INTO "taxonomies" ("id", "site_id", "key", "name", "description", "hierarchical", "is_system")
SELECT gen_random_uuid()::text, "id", 'category', 'Categories', 'Group entries by topic. Categories can be nested.', true, true FROM "sites";--> statement-breakpoint
INSERT INTO "taxonomies" ("id", "site_id", "key", "name", "description", "hierarchical", "is_system")
SELECT gen_random_uuid()::text, "id", 'tag', 'Tags', 'Free-form labels for finding related entries.', false, true FROM "sites";
