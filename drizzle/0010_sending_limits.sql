ALTER TABLE "accounts" ADD COLUMN "emails_per_day" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "gap_min" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "gap_max" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "li_invites_per_day" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "li_dms_per_day" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "next_send_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "touches" ADD COLUMN "mailbox_id" text;--> statement-breakpoint
ALTER TABLE "touches" ADD COLUMN "queued_at" timestamp with time zone;