import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fail, json, withSession } from "@/lib/api";
/* Who this mailbox speaks for: a name and one of the account's authorities. */
export const PATCH = withSession(async (req, s, ctx) => {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { senderName?: string; authorityId?: string | null };
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.id, id), eq(schema.mailboxes.accountId, s.aid)));
  if (!mb) return fail("No such mailbox.", 404);
  const patch: Partial<typeof schema.mailboxes.$inferInsert> = {};
  if (b.senderName !== undefined) patch.senderName = b.senderName.trim() || null;
  if (b.authorityId !== undefined) {
    if (b.authorityId) { const [a] = await db.select().from(schema.authorities).where(and(eq(schema.authorities.id, b.authorityId), eq(schema.authorities.accountId, s.aid))); if (!a) return fail("Unknown authority"); }
    patch.authorityId = b.authorityId || null;
  }
  await db.update(schema.mailboxes).set(patch).where(eq(schema.mailboxes.id, id));
  return json({ ok: true });
});

/* Disconnect a mailbox. The stored app password or token is deleted; loads already read stay. */
export const DELETE = withSession(async (_req, s, ctx) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.id, id), eq(schema.mailboxes.accountId, s.aid)));
  if (!mb) return fail("No such mailbox.", 404);
  await db.delete(schema.mailboxes).where(eq(schema.mailboxes.id, id));
  return json({ ok: true });
});
