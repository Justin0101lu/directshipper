import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
import { seal } from "@/lib/crypto";
import { syncImapMailbox, testImap } from "@/lib/mail/imap";
/* Gmail with an App Password: test the login, store it encrypted, read the first batch right away. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ address: string; appPassword: string; senderName?: string; authorityId?: string }>(req);
  if (!b.address || !b.appPassword) return fail("Enter the Gmail address and the 16-character app password.");
  try { await testImap(b.address.trim(), b.appPassword); }
  catch (e) {
    const m = (e as Error).message || "";
    if (/connection|timeout|ENOTFOUND|ECONN/i.test(m)) return fail("Could not reach Gmail from the server just now. Try again in a minute; if it keeps failing, the host may block outbound IMAP on port 993.");
    return fail(`Gmail did not accept that sign-in: ${m}. Check that 2-Step Verification is on and the app password was copied without spaces.`);
  }
  const db = await getDb();
  const [mb] = await db.insert(schema.mailboxes).values({ accountId: s.aid, kind: "gmail_imap", address: b.address.trim().toLowerCase(), secret: seal(b.appPassword.replace(/\s+/g, "")), senderName: b.senderName?.trim() || null, authorityId: b.authorityId || null }).returning();
  const first = await syncImapMailbox(mb.id, { budget: 25 });
  return json({ ok: true, mailboxId: mb.id, first });
});
