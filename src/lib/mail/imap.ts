import { ImapFlow } from "imapflow";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { unseal } from "@/lib/crypto";
import { ingestMime } from "./ingest";
import { scanMode, subjectPasses } from "./filter";

/* Gmail over IMAP with an App Password. No OAuth, no Google review.
   The carrier turns on 2-Step Verification, makes a 16-character app
   password, and pastes it here. Read-only search, oldest first on the
   first pass so the whole history gets read. */

/* Fail fast on a dead network instead of hanging a request. */
const NET = { connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 120_000 };

const HOSTS: Record<string, { host: string; port: number }> = {
  gmail_imap: { host: "imap.gmail.com", port: 993 },
  imap: { host: "", port: 993 },
};

export async function testImap(address: string, appPassword: string, host = "imap.gmail.com") {
  const client = new ImapFlow({ host, port: 993, secure: true, auth: { user: address, pass: appPassword.replace(/\s+/g, "") }, logger: false, ...NET });
  await client.connect();
  const box = await client.mailboxOpen("INBOX", { readOnly: true });
  const n = box.exists;
  await client.logout();
  return { messages: n };
}

/* Gmail's "All Mail" holds everything including archived threads; fall back to INBOX. */
async function openAll(client: ImapFlow) {
  try { return await client.mailboxOpen("[Gmail]/All Mail", { readOnly: true }); }
  catch { return await client.mailboxOpen("INBOX", { readOnly: true }); }
}

export async function syncImapMailbox(mailboxId: string, opts: { budget?: number } = {}) {
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, mailboxId));
  if (!mb || !mb.secret) return { stored: 0, skipped: 0, errors: ["no mailbox"] };
  const { host } = HOSTS[mb.kind] || HOSTS.gmail_imap;
  const client = new ImapFlow({ host: host || "imap.gmail.com", port: 993, secure: true, auth: { user: mb.address, pass: unseal(mb.secret) }, logger: false, ...NET });
  const totals = { stored: 0, skipped: 0, errors: [] as string[] };
  const budget = opts.budget ?? 150;            // messages per run, keeps a cron tick short
  try {
    await client.connect();
    await openAll(client);
    /* UIDs are increasing; walk up from the last one we saw. */
    const range = mb.lastUid > 0 ? `${mb.lastUid + 1}:*` : "1:*";
    const terms = scanMode() === "strict"
      ? [{ subject: "rate con" }, { subject: "confirmation" }, { subject: "tender" }, { subject: "dispatch" }, { subject: "load #" }, { subject: "load number" }, { subject: "bol" }, { subject: "carrier" }]
      : [{ subject: "rate" }, { subject: "confirmation" }, { subject: "load" }, { subject: "tender" }, { subject: "dispatch" }, { body: "rate confirmation" }];
    const uids = (await client.search({ uid: range, or: terms }, { uid: true })) as number[];
    uids.sort((a, b) => a - b);
    const batch = uids.slice(0, budget);
    let last = mb.lastUid;
    for (const uid of batch) {
      try {
        /* Envelope first (a few bytes). Only a subject that passes gets its body fetched. */
        const env = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
        if (!env || !subjectPasses(env.envelope?.subject || "")) { totals.skipped++; last = Math.max(last, uid); continue; }
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg && msg.source) {
          const r = await ingestMime(mb.accountId, mb.id, msg.source, `imap:${mb.address}:${uid}`);
          totals.stored += r.stored; totals.skipped += r.skipped + (r.dupes || 0); totals.errors.push(...r.errors);
        }
      } catch (e) { totals.errors.push(`uid ${uid}: ${(e as Error).message}`); }
      last = Math.max(last, uid);
    }
    /* If nothing matched the search above the last UID, still advance past the mailbox's top UID. */
    if (!batch.length) {
      const top = (await client.search({ uid: range }, { uid: true })) as number[];
      if (top.length) last = Math.max(last, ...top);
    }
    const note = totals.errors.length && !totals.stored ? `Reading failed: ${totals.errors[0]}` : null;
    if (totals.errors.length) console.error("[imap]", mb.address, totals.errors.slice(0, 3));
    await db.update(schema.mailboxes).set({ lastUid: last, lastSyncAt: new Date(), status: "ok", error: note, historyDone: uids.length <= budget,
      queued: Math.max(0, uids.length - batch.length), readCount: mb.readCount + totals.stored }).where(eq(schema.mailboxes.id, mb.id));
  } catch (e) {
    await db.update(schema.mailboxes).set({ status: "error", error: (e as Error).message }).where(eq(schema.mailboxes.id, mb.id));
    totals.errors.push((e as Error).message);
  } finally { try { await client.logout(); } catch { /* closed */ } }
  return totals;
}

/* Reply detection: look for mail from the contact since a date. */
export async function findRepliesImap(mailboxId: string, fromAddress: string, since: Date) {
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, mailboxId));
  if (!mb?.secret) return [];
  const { host } = HOSTS[mb.kind] || HOSTS.gmail_imap;
  const client = new ImapFlow({ host: host || "imap.gmail.com", port: 993, secure: true, auth: { user: mb.address, pass: unseal(mb.secret) }, logger: false, ...NET });
  const out: { text: string; date: Date; messageId: string }[] = [];
  try {
    await client.connect();
    await openAll(client);
    const uids = (await client.search({ from: fromAddress, since }, { uid: true })) as number[];
    for (const uid of uids.slice(-5)) {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const { simpleParser } = await import("mailparser");
      const m = await simpleParser(msg.source);
      out.push({ text: (m.text || "").split(/\n(On .* wrote:|-----Original)/)[0].trim(), date: m.date || new Date(), messageId: m.messageId || String(uid) });
    }
  } finally { try { await client.logout(); } catch { /* closed */ } }
  return out;
}
