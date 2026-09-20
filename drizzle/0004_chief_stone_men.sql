CREATE TABLE "parse_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"mailbox_id" text,
	"source_ref" text NOT NULL,
	"doc_hash" text,
	"filename" text,
	"from_email" text,
	"text" text NOT NULL,
	"has_scan" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone,
	"status" text DEFAULT 'queued' NOT NULL,
	"batch_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parse_queue" ADD CONSTRAINT "parse_queue_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parse_queue" ADD CONSTRAINT "parse_queue_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parse_queue_status_idx" ON "parse_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "parse_queue_account_idx" ON "parse_queue" USING btree ("account_id");