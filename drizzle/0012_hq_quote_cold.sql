ALTER TABLE "contacts" ADD COLUMN "scope" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE "facilities" ADD COLUMN "company_key" text;--> statement-breakpoint
ALTER TABLE "facilities" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "sequences" ADD COLUMN "quote_note" text;