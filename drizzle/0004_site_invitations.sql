CREATE TABLE "site_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "site_role" NOT NULL,
	"token_hash" text NOT NULL,
	"token_encrypted" text NOT NULL,
	"invited_by_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_id" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_invitations" ADD CONSTRAINT "site_invitations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_invitations" ADD CONSTRAINT "site_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_invitations" ADD CONSTRAINT "site_invitations_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_invitations_token_hash_unique" ON "site_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "site_invitations_one_open" ON "site_invitations" USING btree ("site_id","email") WHERE "site_invitations"."accepted_at" is null and "site_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "site_invitations_site_idx" ON "site_invitations" USING btree ("site_id","created_at");