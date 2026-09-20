import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { clearSession } from "@/lib/auth";
import { json, withSession } from "@/lib/api";
/* Delete my data: the account row cascades to loads, contacts, sequences, ledger, mailboxes.
   Facilities are shared, anonymous records and stay; nothing in them points back. */
export const DELETE = withSession(async (_req, s) => {
  const db = await getDb();
  await db.delete(schema.accounts).where(eq(schema.accounts.id, s.aid));
  await clearSession();
  return json({ ok: true });
});
