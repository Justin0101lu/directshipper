ALTER TABLE "accounts" ADD COLUMN "calls_per_day" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "li_invites_per_day";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "li_dms_per_day";--> statement-breakpoint
ALTER TABLE "touches" ADD COLUMN "outcome" text;