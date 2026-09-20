ALTER TABLE "accounts" ALTER COLUMN "tokens_monthly" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "auto_topup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger" ADD COLUMN "extra" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger" ADD COLUMN "cents" integer DEFAULT 0 NOT NULL;