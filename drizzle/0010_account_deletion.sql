ALTER TABLE "site_ownership_transfers" DROP CONSTRAINT "site_ownership_transfers_from_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "site_ownership_transfers" DROP CONSTRAINT "site_ownership_transfers_recipient_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "site_ownership_transfers" ALTER COLUMN "from_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "site_ownership_transfers" ADD CONSTRAINT "site_ownership_transfers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_ownership_transfers" ADD CONSTRAINT "site_ownership_transfers_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;