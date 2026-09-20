import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { syncImapMailbox } from "@/lib/mail/imap";
import { syncGraphMailbox } from "@/lib/mail/graph";
/* "Scan now" from the UI: one bounded pass over every connected mailbox. */
export const POST = withSession(async (_req, s) => {
  const db = await getDb();
  const boxes = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.accountId, s.aid)));
  const out: Record<string, unknown> = {};
  for (const mb of boxes) {
    if (mb.kind === "gmail_imap") out[mb.address] = await syncImapMailbox(mb.id, { budget: 60 });
    if (mb.kind === "microsoft") out[mb.address] = await syncGraphMailbox(mb.id, { budget: 40 });
  }
  return json(out);
});
