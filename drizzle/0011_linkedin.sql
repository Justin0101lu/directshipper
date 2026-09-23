ALTER TABLE "accounts" ADD COLUMN "li_gap_min" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "li_gap_max" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "li_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "linkedin_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "linkedin_distance" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "linkedin_account_id" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "linkedin_name" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "linkedin_status" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "next_li_at" timestamp with time zone;