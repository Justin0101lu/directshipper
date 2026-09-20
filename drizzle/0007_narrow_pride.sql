ALTER TABLE "mailboxes" ADD COLUMN "sender_name" text;--> statement-breakpoint
ALTER TABLE "sequences" ADD COLUMN "mailbox_id" text;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;