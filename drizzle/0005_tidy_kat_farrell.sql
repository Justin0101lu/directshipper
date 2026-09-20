ALTER TABLE "sequences" DROP CONSTRAINT "sequences_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "sequences" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sequences" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;