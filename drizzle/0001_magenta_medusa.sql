CREATE TABLE "stops" (
	"id" text PRIMARY KEY NOT NULL,
	"load_id" text NOT NULL,
	"account_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"facility_id" text,
	"city" text,
	"state" text,
	"at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "queued" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "read_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_load_id_loads_id_fk" FOREIGN KEY ("load_id") REFERENCES "public"."loads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stops_account_idx" ON "stops" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "stops_facility_idx" ON "stops" USING btree ("facility_id");