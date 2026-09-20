import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { seal, unseal } from "@/lib/crypto";
import { ingestMime } from "./ingest";

/* Outlook via Microsoft Graph. Microsoft turned off password sign-in for
   IMAP, so this one is OAuth. Free to register, no paid audit; an
   unverified publisher only shows a warning on the consent screen. */

const SCOPES = "offline_access Mail.Read Mail.Send User.Read";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";

export const msEnabled = () => !!(env.ms.id && env.ms.secret);

export function msAuthUrl(state: string) {
  const p = new URLSearchParams({ client_id: env.ms.id, response_type: "code", redirect_uri: `${env.appUrl}/api/mail/microsoft/callback`, response_mode: "query", scope: SCOPES, state });
  return `${AUTH}/authorize?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch(`${AUTH}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.ms.id, client_secret: env.ms.secret, ...body }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || "Microsoft sign-in failed");
  return j as { access_token: string; refresh_token: string };
}

export async function msExchangeCode(code: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: `${env.appUrl}/api/mail/microsoft/callback`, scope: SCOPES });
}

type Mailbox = typeof schema.mailboxes.$inferSelect;

async function accessToken(mb: Mailbox) {
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: unseal(mb.secret!), scope: SCOPES });
  if (t.refresh_token) {
    const db = await getDb();
    await db.update(schema.mailboxes).set({ secret: seal(t.refresh_token) }).where(eq(schema.mailboxes.id, mb.id));
  }
  return t.access_token;
}

export async function msMe(access: string) {
  const r = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { authorization: `Bearer ${access}` } });
  const j = await r.json();
  return (j.mail || j.userPrincipalName) as string;
}

export async function syncGraphMailbox(mailboxId: string, opts: { budget?: number } = {}) {
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, mailboxId));
  if (!mb?.secret) return { stored: 0, skipped: 0, errors: ["no mailbox"] };
  const totals = { stored: 0, skipped: 0, errors: [] as string[] };
  try {
    const access = await accessToken(mb);
    const budget = opts.budget ?? 100;
    /* lastUid doubles as a page offset for Graph; messages ordered oldest first so history fills in. */
    const q = new URLSearchParams({ $search: '"rate confirmation OR load OR tender OR dispatch"', $top: String(budget), $skip: String(mb.lastUid), $select: "id,subject,receivedDateTime,hasAttachments" });
    const r = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${q}`, { headers: { authorization: `Bearer ${access}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || "Graph error");
    const items: { id: string }[] = j.value || [];
    for (const it of items) {
      try {
        const m = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${it.id}/$value`, { headers: { authorization: `Bearer ${access}` } });
        const raw = Buffer.from(await m.arrayBuffer());
        const res = await ingestMime(mb.accountId, mb.id, raw, `graph:${mb.address}:${it.id}`);
        totals.stored += res.stored; totals.skipped += res.skipped; totals.errors.push(...res.errors);
      } catch (e) { totals.errors.push((e as Error).message); }
    }
    await db.update(schema.mailboxes).set({ lastUid: mb.lastUid + items.length, lastSyncAt: new Date(), status: "ok", error: null, historyDone: items.length < budget,
      queued: items.length < budget ? 0 : budget, readCount: mb.readCount + totals.stored }).where(eq(schema.mailboxes.id, mb.id));
  } catch (e) {
    await db.update(schema.mailboxes).set({ status: "error", error: (e as Error).message }).where(eq(schema.mailboxes.id, mb.id));
    totals.errors.push((e as Error).message);
  }
  return totals;
}

export async function graphSend(mb: Mailbox, msg: { to: string; subject: string; text: string }) {
  const access = await accessToken(mb);
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST", headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { subject: msg.subject, body: { contentType: "Text", content: msg.text }, toRecipients: [{ emailAddress: { address: msg.to } }] }, saveToSentItems: true }),
  });
  if (!r.ok) throw new Error(`Outlook send failed: ${r.status}`);
  return { messageId: `graph-${Date.now()}` };
}

export async function findRepliesGraph(mb: Mailbox, fromAddress: string, since: Date) {
  const access = await accessToken(mb);
  const q = new URLSearchParams({ $filter: `from/emailAddress/address eq '${fromAddress}' and receivedDateTime ge ${since.toISOString()}`, $select: "id,receivedDateTime,bodyPreview,internetMessageId", $top: "5" });
  const r = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${q}`, { headers: { authorization: `Bearer ${access}` } });
  const j = await r.json();
  return ((j.value || []) as { bodyPreview: string; receivedDateTime: string; internetMessageId: string }[]).map((m) => ({ text: m.bodyPreview, date: new Date(m.receivedDateTime), messageId: m.internetMessageId }));
}
