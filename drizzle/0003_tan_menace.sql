ALTER TABLE "loads" ADD COLUMN "doc_hash" text;--> statement-breakpoint
CREATE INDEX "loads_hash_idx" ON "loads" USING btree ("account_id","doc_hash");