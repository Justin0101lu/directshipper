CREATE TABLE "authorities" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"mc" text,
	"loads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "autopilot" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "auto_per_day" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "carrier_name" text;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "carrier_mc" text;--> statement-breakpoint
ALTER TABLE "loads" ADD COLUMN "authority_id" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "authority_id" text;--> statement-breakpoint
ALTER TABLE "authorities" ADD CONSTRAINT "authorities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authorities_account_idx" ON "authorities" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_authority_id_authorities_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."authorities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_authority_id_authorities_id_fk" FOREIGN KEY ("authority_id") REFERENCES "public"."authorities"("id") ON DELETE set null ON UPDATE no action;