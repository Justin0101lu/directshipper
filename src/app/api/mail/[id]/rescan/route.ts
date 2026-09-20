import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fail, json, withSession } from "@/lib/api";
import { syncImapMailbox } from "@/lib/mail/imap";
import { syncGraphMailbox } from "@/lib/mail/graph";
/* Start the history walk over from the oldest message. Loads already stored are
   skipped by their source reference, so nothing doubles up. */
export const POST = withSession(async (_req, s, ctx) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.id, id), eq(schema.mailboxes.accountId, s.aid)));
  if (!mb) return fail("No such mailbox.", 404);
  await db.update(schema.mailboxes).set({ lastUid: 0, historyDone: false, queued: 0, error: null, status: "ok" }).where(eq(schema.mailboxes.id, id));
  const first = mb.kind === "microsoft" ? await syncGraphMailbox(id, { budget: 40 }) : await syncImapMailbox(id, { budget: 60 });
  return json(first);
});
