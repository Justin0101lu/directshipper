import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fail, json, withSession } from "@/lib/api";
import { disconnect } from "@/lib/linkedin/unipile";
/* Disconnect the LinkedIn account behind a mailbox. Steps go back to copy-only. */
export const DELETE = withSession(async (_req, s, ctx) => {
  const { mailboxId } = await ctx.params;
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.id, mailboxId), eq(schema.mailboxes.accountId, s.aid)));
  if (!mb) return fail("No such mailbox.", 404);
  if (mb.linkedinAccountId) await disconnect(mb.linkedinAccountId);
  await db.update(schema.mailboxes).set({ linkedinAccountId: null, linkedinName: null, linkedinStatus: null }).where(eq(schema.mailboxes.id, mb.id));
  return json({ ok: true });
});
