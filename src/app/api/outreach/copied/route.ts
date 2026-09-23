import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, json, withSession } from "@/lib/api";
/* The carrier made the call (or pasted an older LinkedIn note). Mark the step done with what happened. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ touchId: string; outcome?: string }>(req);
  const db = await getDb();
  const [t] = await db.select({ id: schema.touches.id, seq: schema.touches.sequenceId }).from(schema.touches).where(eq(schema.touches.id, b.touchId));
  if (t) {
    const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, t.seq), eq(schema.sequences.accountId, s.aid)));
    if (seq) {
      const outcome = ["spoke", "voicemail", "no_answer", "wrong_number"].includes(b.outcome || "") ? b.outcome! : null;
      await db.update(schema.touches).set({ status: "sent", sentAt: new Date(), outcome }).where(eq(schema.touches.id, t.id));
      if (outcome === "spoke") await db.update(schema.sequences).set({ status: "paused", suggested: "You spoke with them. The email follow-ups are paused; resume if the conversation needs a nudge, or leave it here." }).where(eq(schema.sequences.id, seq.id));
      if (outcome === "wrong_number") await db.update(schema.contacts).set({ phone: null }).where(eq(schema.contacts.id, seq.contactId || ""));
    }
  }
  return json({ ok: true });
});
