import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { claude, PARSE_MODEL, aiReady } from "./client";
import { buildParseRequest, parseWireJson } from "./parse";
import { storeLoad } from "@/lib/freight/store";

/* Half-price reading for history scans. Documents are queued as trimmed
   text; the cron submits them as one batch and collects results on later
   ticks. Most batches finish within the hour; the API allows up to a day.
   Scanned PDFs (no text layer) are not queued: they need the bytes. */

export const batchEnabled = () => process.env.BATCH_HISTORY !== "0";

export async function enqueue(row: { accountId: string; mailboxId: string | null; sourceRef: string; docHash: string; filename?: string; fromEmail: string | null; text: string; receivedAt: Date }) {
  const db = await getDb();
  await db.insert(schema.parseQueue).values({ ...row, hasScan: false });
}

export async function submitBatches(limit = 2000) {
  if (!aiReady()) return { submitted: 0 };
  const db = await getDb();
  const rows = await db.select().from(schema.parseQueue).where(eq(schema.parseQueue.status, "queued")).limit(limit);
  if (rows.length < 1) return { submitted: 0 };
  const requests = [];
  for (const r of rows) {
    const { params } = await buildParseRequest({ text: r.text, filename: r.filename || undefined });
    requests.push({ custom_id: r.id, params: { ...params, model: PARSE_MODEL } });
  }
  const batch = await claude().messages.batches.create({ requests });
  await db.update(schema.parseQueue).set({ status: "submitted", batchId: batch.id }).where(inArray(schema.parseQueue.id, rows.map((r) => r.id)));
  console.log(`[batch] submitted ${rows.length} documents as ${batch.id}`);
  return { submitted: rows.length, batchId: batch.id };
}

export async function collectBatches() {
  if (!aiReady()) return { stored: 0 };
  const db = await getDb();
  const pending = await db.select({ batchId: schema.parseQueue.batchId }).from(schema.parseQueue).where(eq(schema.parseQueue.status, "submitted")).groupBy(schema.parseQueue.batchId);
  let stored = 0, failed = 0;
  for (const { batchId } of pending) {
    if (!batchId) continue;
    const b = await claude().messages.batches.retrieve(batchId);
    if (b.processing_status !== "ended") continue;
    for await (const result of await claude().messages.batches.results(batchId)) {
      const [row] = await db.select().from(schema.parseQueue).where(and(eq(schema.parseQueue.id, result.custom_id), eq(schema.parseQueue.status, "submitted")));
      if (!row) continue;
      try {
        if (result.result.type !== "succeeded") throw new Error(result.result.type === "errored" ? result.result.error.type : result.result.type);
        const text = result.result.message.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("");
        const rc = parseWireJson(text);
        if (rc.is_rate_confirmation) {
          if (row.fromEmail) rc.broker.email = row.fromEmail;
          const ok = await storeLoad(row.accountId, row.mailboxId, row.sourceRef, rc, row.receivedAt || new Date(), row.docHash || undefined);
          if (ok) stored++;
        }
        await db.update(schema.parseQueue).set({ status: "done" }).where(eq(schema.parseQueue.id, row.id));
      } catch (e) {
        failed++;
        await db.update(schema.parseQueue).set({ status: "failed", error: (e as Error).message }).where(eq(schema.parseQueue.id, row.id));
      }
    }
    if (stored) {
      /* keep the per-mailbox load count honest */
      const boxes = await db.select({ id: schema.parseQueue.mailboxId, n: schema._sql<number>`count(*)` }).from(schema.parseQueue).where(and(eq(schema.parseQueue.batchId, batchId), eq(schema.parseQueue.status, "done"))).groupBy(schema.parseQueue.mailboxId);
      for (const bx of boxes) if (bx.id) await db.update(schema.mailboxes).set({ readCount: schema._sql`${schema.mailboxes.readCount} + ${Number(bx.n)}` }).where(eq(schema.mailboxes.id, bx.id));
    }
  }
  return { stored, failed };
}

export async function queueDepth(accountId: string) {
  const db = await getDb();
  const [r] = await db.select({ n: schema._sql<number>`count(*)` }).from(schema.parseQueue).where(and(eq(schema.parseQueue.accountId, accountId), inArray(schema.parseQueue.status, ["queued", "submitted"])));
  return Number(r?.n || 0);
}
