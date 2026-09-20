CREATE TABLE "agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"broker" text NOT NULL,
	"broker_mc" text,
	"term_months" integer,
	"from_event" text,
	"survives" boolean,
	"covers_consignees" boolean,
	"covers_all_locations" boolean,
	"damages" text,
	"clause" text NOT NULL,
	"page" text,
	"filename" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreements_account_idx" ON "agreements" USING btree ("account_id");