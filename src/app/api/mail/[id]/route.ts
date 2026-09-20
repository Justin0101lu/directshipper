import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fail, json, withSession } from "@/lib/api";
/* Disconnect a mailbox. The stored app password or token is deleted; loads already read stay. */
export const DELETE = withSession(async (_req, s, ctx) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.id, id), eq(schema.mailboxes.accountId, s.aid)));
  if (!mb) return fail("No such mailbox.", 404);
  await db.delete(schema.mailboxes).where(eq(schema.mailboxes.id, id));
  return json({ ok: true });
});
