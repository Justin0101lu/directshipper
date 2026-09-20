import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, json, withSession } from "@/lib/api";
/* The carrier pasted a LinkedIn note. Mark the step done. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ touchId: string }>(req);
  const db = await getDb();
  const [t] = await db.select({ id: schema.touches.id, seq: schema.touches.sequenceId }).from(schema.touches).where(eq(schema.touches.id, b.touchId));
  if (t) {
    const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, t.seq), eq(schema.sequences.accountId, s.aid)));
    if (seq) await db.update(schema.touches).set({ status: "sent", sentAt: new Date() }).where(eq(schema.touches.id, t.id));
  }
  return json({ ok: true });
});
