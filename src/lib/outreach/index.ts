import { and, asc, desc, eq, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SEQUENCE, draftSequence } from "@/lib/ai/draft";
import { triageReply } from "@/lib/ai/triage";
import { sendAs } from "@/lib/mail/smtp";
import { findRepliesImap } from "@/lib/mail/imap";
import { findRepliesGraph } from "@/lib/mail/graph";
import { computeProfile } from "@/lib/freight/profile";
import { outboundFor } from "@/lib/freight/network";
import { PLANS, type PlanId } from "@/lib/plans";

/* Outreach: seven touches over thirty days. The carrier approves the
   opener; email follow-ups send themselves; LinkedIn steps are copy-only;
   everything stops the moment they reply. Sends never cost a token. */

async function sendingMailbox(accountId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.accountId, accountId));
  return rows.find((m) => (m.kind === "gmail_imap" || m.kind === "microsoft") && m.secret) || null;
}

export async function startSequence(accountId: string, contactId: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
  if (!c) throw new Error("No contact");
  const paid = await db.select({ f: schema.reveals.field }).from(schema.reveals).where(and(eq(schema.reveals.accountId, accountId), eq(schema.reveals.contactId, contactId)));
  const has = new Set(paid.map((r) => r.f));
  if (!has.has("name") || !c.name) throw new Error("Reveal the contact's name first, so the touches can address someone.");
  if (!has.has("email") || !c.email) throw new Error("Reveal a verified email first.");
  const existing = await db.select().from(schema.sequences).where(and(eq(schema.sequences.accountId, accountId), eq(schema.sequences.contactId, contactId))).limit(1);
  if (existing.length) return existing[0];
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, c.facilityId));
  const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.accountId, accountId)).limit(1);
  const prof = await computeProfile(accountId);
  const L = schema.loads;
  const [dcount] = await db.select({ n: schema._sql<number>`count(distinct ${schema.stops.loadId})` }).from(schema.stops).where(and(eq(schema.stops.accountId, accountId), eq(schema.stops.kind, "drop"), eq(schema.stops.facilityId, f.id)));
  const deliveries = Number(dcount?.n || 0);
  const ob = await outboundFor(f.id, accountId);
  const dh = prof.deadhead.find((d) => d.city.startsWith(f.city));
  const touches = await draftSequence({
    carrier: acct.company, signer: user?.name || acct.company, contactFirst: c.name.split(" ")[0], contactTitle: c.title,
    facility: f.name, city: `${f.city}, ${f.state}`, deliveries,
    theirOutbound: ob.ok && ob.lanes[0] ? `${ob.lanes[0].dest} ${ob.lanes[0].pct}% of their outbound` : null,
    ourHomeLane: prof.home || "our home base", deadhead: dh ? `we run back empty from ${dh.city} ${dh.pct}% of the time` : null,
    equipment: prof.equipment[0]?.name === "Dry van" ? "53' dry van" : "53' reefer", kind: deliveries > 0 ? "receiver" : "lookalike",
  });
  const [seq] = await db.insert(schema.sequences).values({ accountId, contactId, facilityId: f.id, status: "draft", step: 0 }).returning();
  await db.insert(schema.touches).values(touches.map((t, i) => ({ sequenceId: seq.id, step: i, channel: SEQUENCE[i].channel, subject: t.subject, body: t.body, status: "draft" })));
  return seq;
}

/* Approve the opener: sends it now and schedules the rest. */
export async function approveOpener(accountId: string, sequenceId: string, edited?: { subject?: string; body?: string }) {
  const db = await getDb();
  const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.accountId, accountId)));
  if (!seq) throw new Error("No sequence");
  const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (!PLANS[acct.plan as PlanId].outreach) throw new Error("Sending is on Carrier and Fleet. Drafting stays free.");
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seq.contactId));
  if (!c.email) throw new Error("Reveal a verified email first.");
  if (c.emailStatus === "bounced") throw new Error("That address bounced. Reveal a new one.");
  const mb = await sendingMailbox(accountId);
  if (!mb) throw new Error("Connect a Gmail or Outlook mailbox to send from.");
  const [t] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, 0)));
  const subject = edited?.subject ?? t.subject ?? "Your outbound freight";
  const body = edited?.body ?? t.body;
  const { messageId } = await sendAs(mb.id, { to: c.email, subject, text: body });
  await db.update(schema.touches).set({ status: "sent", subject, body, messageId, sentAt: new Date() }).where(eq(schema.touches.id, t.id));
  await db.update(schema.sequences).set({ status: "active", step: 1, threadId: messageId, nextAt: new Date(Date.now() + SEQUENCE[1].day * 86400e3) }).where(eq(schema.sequences.id, seq.id));
}

/* Runs from cron. Sends due email steps; LinkedIn steps just become "copy me" items. */
export async function runDueSteps() {
  const db = await getDb();
  const due = await db.select().from(schema.sequences).where(and(eq(schema.sequences.status, "active"), lte(schema.sequences.nextAt, new Date()))).limit(50);
  let sent = 0;
  for (const seq of due) {
    try {
      await checkReply(seq.id);
      const [fresh] = await db.select().from(schema.sequences).where(eq(schema.sequences.id, seq.id));
      if (fresh.status !== "active") continue;
      const step = fresh.step;
      if (step >= SEQUENCE.length) { await db.update(schema.sequences).set({ status: "done", nextAt: null }).where(eq(schema.sequences.id, seq.id)); continue; }
      const [t] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, step)));
      if (t.channel === "email") {
        const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seq.contactId));
        const mb = await sendingMailbox(seq.accountId);
        if (!mb || !c.email || c.emailStatus === "bounced") { await db.update(schema.sequences).set({ status: "paused" }).where(eq(schema.sequences.id, seq.id)); continue; }
        const [opener] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, 0)));
        const { messageId } = await sendAs(mb.id, { to: c.email, subject: `Re: ${opener.subject}`, text: t.body, inReplyTo: seq.threadId || undefined, references: seq.threadId || undefined });
        await db.update(schema.touches).set({ status: "sent", messageId, sentAt: new Date() }).where(eq(schema.touches.id, t.id));
        sent++;
      } else {
        await db.update(schema.touches).set({ status: "copied" }).where(eq(schema.touches.id, t.id));   // waits in the queue for the carrier to paste
      }
      const next = step + 1;
      const nextAt = next < SEQUENCE.length ? new Date(Date.now() + (SEQUENCE[next].day - SEQUENCE[step].day) * 86400e3) : null;
      await db.update(schema.sequences).set({ step: next, nextAt, status: nextAt ? "active" : "done" }).where(eq(schema.sequences.id, seq.id));
    } catch (e) {
      await db.update(schema.sequences).set({ status: "paused", suggested: `Paused: ${(e as Error).message}` }).where(eq(schema.sequences.id, seq.id));
    }
  }
  return { sent, checked: due.length };
}

/* Look in the carrier's mailbox for mail from the contact since the opener.
   A reply stops the sequence, gets labelled, and gets a suggested answer. */
export async function checkReply(sequenceId: string) {
  const db = await getDb();
  const [seq] = await db.select().from(schema.sequences).where(eq(schema.sequences.id, sequenceId));
  if (!seq || seq.status !== "active") return false;
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seq.contactId));
  if (!c.email) return false;
  const mb = await sendingMailbox(seq.accountId);
  if (!mb) return false;
  const [opener] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, 0)));
  const since = opener.sentAt || seq.createdAt;
  const replies = mb.kind === "microsoft" ? await findRepliesGraph(mb, c.email, since) : await findRepliesImap(mb.id, c.email, since);
  if (!replies.length) return false;
  const r = replies[replies.length - 1];
  const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, seq.accountId));
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, seq.facilityId));
  const sent = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.status, "sent"))).orderBy(asc(schema.touches.step));
  const prof = await computeProfile(seq.accountId);
  let label = "unclear", suggested: string | null = null, checkBack: string | null = null;
  try {
    const t = await triageReply({
      carrier: acct.company, contactName: c.name || "the contact", facility: f.name,
      ourThread: sent.map((s) => `[${s.channel} day ${SEQUENCE[s.step].day}] ${s.subject ? s.subject + "\n" : ""}${s.body}`).join("\n\n"),
      reply: r.text, profileLine: `we haul ${prof.families[0]?.name ?? "freight"} on ${prof.equipment[0]?.name ?? "trailers"}, home base ${prof.home ?? "unknown"}, average ${prof.avgMiles ?? "?"} miles`,
    });
    label = t.label; suggested = t.suggested_reply; checkBack = t.check_back;
  } catch { /* leave unlabelled; the carrier still sees the reply */ }
  await db.update(schema.sequences).set({
    status: label === "not_now" && checkBack ? "paused" : "replied", replyLabel: label, replyText: r.text, replyAt: r.date, suggested,
    nextAt: label === "not_now" && checkBack ? new Date(checkBack) : null,
  }).where(eq(schema.sequences.id, seq.id));
  return true;
}

export async function sendSuggestedReply(accountId: string, sequenceId: string, body: string) {
  const db = await getDb();
  const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.accountId, accountId)));
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seq.contactId));
  const mb = await sendingMailbox(accountId);
  if (!mb || !c.email) throw new Error("No mailbox or email to send with.");
  const [opener] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, 0)));
  await sendAs(mb.id, { to: c.email, subject: `Re: ${opener.subject}`, text: body, inReplyTo: seq.threadId || undefined, references: seq.threadId || undefined });
  await db.insert(schema.touches).values({ sequenceId: seq.id, step: 99, channel: "email", subject: `Re: ${opener.subject}`, body, status: "sent", sentAt: new Date() });
  await db.update(schema.sequences).set({ suggested: null }).where(eq(schema.sequences.id, seq.id));
}

export async function queue(accountId: string) {
  const db = await getDb();
  const seqs = await db.select().from(schema.sequences).where(eq(schema.sequences.accountId, accountId)).orderBy(desc(schema.sequences.createdAt));
  const out = [];
  for (const s of seqs) {
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, s.contactId));
    const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, s.facilityId));
    const touches = await db.select().from(schema.touches).where(eq(schema.touches.sequenceId, s.id)).orderBy(asc(schema.touches.step));
    out.push({ ...s, contact: c, facility: f, touches, next: touches.find((t) => t.step === s.step) || null });
  }
  return out;
}
