CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"mc" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"tokens_monthly" integer DEFAULT 20 NOT NULL,
	"tokens_extra" integer DEFAULT 0 NOT NULL,
	"daily_cap" integer DEFAULT 25 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"forward_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"facility_id" text NOT NULL,
	"name" text,
	"title" text,
	"linkedin" text,
	"email" text,
	"email_status" text,
	"phone" text,
	"source" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"street" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text,
	"type" text DEFAULT 'unknown' NOT NULL,
	"shipper" text,
	"domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"delta" integer NOT NULL,
	"what" text NOT NULL,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loads" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"mailbox_id" text,
	"source_ref" text,
	"load_number" text,
	"broker" text,
	"broker_mc" text,
	"broker_email" text,
	"shipper" text,
	"origin_id" text,
	"dest_id" text,
	"origin_city" text,
	"origin_state" text,
	"dest_city" text,
	"dest_state" text,
	"pickup_at" timestamp with time zone,
	"delivery_at" timestamp with time zone,
	"commodity" text,
	"family" text,
	"equipment" text,
	"temp_f" double precision,
	"miles" integer,
	"rate" double precision,
	"per_mile" double precision,
	"direct" boolean DEFAULT false NOT NULL,
	"confidence" double precision,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"address" text NOT NULL,
	"secret" text,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"history_done" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"facility_id" text NOT NULL,
	"kind" text NOT NULL,
	"why" text,
	"revealed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"q" text NOT NULL,
	"answer" text,
	"citations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"facility_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp with time zone,
	"thread_id" text,
	"reply_label" text,
	"reply_text" text,
	"reply_at" timestamp with time zone,
	"suggested" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "touches" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"step" integer NOT NULL,
	"channel" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_origin_id_facilities_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loads" ADD CONSTRAINT "loads_dest_id_facilities_id_fk" FOREIGN KEY ("dest_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touches" ADD CONSTRAINT "touches_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_key_idx" ON "facilities" USING btree ("key");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "loads_account_idx" ON "loads" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loads_source_idx" ON "loads" USING btree ("account_id","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "prospects_unique_idx" ON "prospects" USING btree ("account_id","facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");