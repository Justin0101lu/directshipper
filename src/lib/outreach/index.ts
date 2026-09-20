import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SEQUENCE, draftSequence, personalize } from "@/lib/ai/draft";
import { triageReply } from "@/lib/ai/triage";
import { aiReady } from "@/lib/ai/client";
import { sendAs } from "@/lib/mail/smtp";
import { findRepliesImap } from "@/lib/mail/imap";
import { findRepliesGraph } from "@/lib/mail/graph";
import { computeProfile } from "@/lib/freight/profile";
import { outboundFor } from "@/lib/freight/network";
import { relationship, relationshipLine, type Relationship } from "@/lib/freight/relationship";
import { visibleContacts, type Visible } from "@/lib/enrich";
import { dockHolds, type DockHold } from "@/lib/freight/holds";
import { PLANS, type PlanId } from "@/lib/plans";

/* Outreach, prepared for the carrier.

   A sequence belongs to a dock and is written from the carrier's own history
   there, addressed to {{first}}. A person is attached later, when the
   carrier reveals an email. Approving the opener sends it and schedules the
   rest; a reply stops everything and drafts the answer. */

export async function sendingMailboxes(accountId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.accountId, accountId));
  return rows.filter((m) => (m.kind === "gmail_imap" || m.kind === "microsoft") && m.secret);
}
/* The mailbox a sequence sends from: the one pinned to it, else the account's first. */
async function sendingMailbox(accountId: string, preferId?: string | null) {
  const boxes = await sendingMailboxes(accountId);
  return (preferId && boxes.find((m) => m.id === preferId)) || boxes[0] || null;
}
/* "Justin Ruiz, owner · RT Reefer Express Inc": the person and the company the mailbox speaks for. */
async function signerOf(mb: { senderName: string | null; address: string; authorityId?: string | null } | null, fallback: string) {
  if (!mb) return fallback;
  let company = "";
  if (mb.authorityId) { const db = await getDb(); const [a] = await db.select({ name: schema.authorities.name }).from(schema.authorities).where(eq(schema.authorities.id, mb.authorityId)); company = a?.name || ""; }
  const person = mb.senderName || fallback;
  return company && !person.toLowerCase().includes(company.toLowerCase()) ? `${person}\n${company}` : person;
}

export async function setSender(accountId: string, sequenceId: string, mailboxId: string) {
  const db = await getDb();
  const boxes = await sendingMailboxes(accountId);
  if (!boxes.find((m) => m.id === mailboxId)) throw new Error("That mailbox is not connected to this account.");
  await db.update(schema.sequences).set({ mailboxId }).where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.accountId, accountId)));
}

/* Write the seven touches for one dock. Costs one drafting call; no tokens. */
export async function prepareDock(accountId: string, facilityId: string) {
  const db = await getDb();
  const existing = await db.select().from(schema.sequences).where(and(eq(schema.sequences.accountId, accountId), eq(schema.sequences.facilityId, facilityId))).limit(1);
  if (existing.length) return existing[0];
  const hold = await dockHolds(accountId, facilityId);
  if (!hold.clear) throw new Error(hold.reason);
  if (!aiReady()) throw new Error("ANTHROPIC_API_KEY is not set, so nothing can be drafted.");
  const rel = await relationship(accountId, facilityId);
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId));
  if (!f) throw new Error("Unknown dock");
  const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.accountId, accountId)).limit(1);
  const prof = await computeProfile(accountId);
  const ob = await outboundFor(f.id, accountId);
  const dh = prof.deadhead.find((d) => d.city.startsWith(f.city));
  const summary = rel ? relationshipLine(rel) : "No loads with this dock yet; matched to your freight profile.";
  const touches = await draftSequence({
    carrier: acct.company, signer: "{{signer}}", contactFirst: null, contactTitle: null,
    facility: f.name, city: `${f.city}, ${f.state}`, relationship: summary, kind: rel ? rel.kind : "lookalike",
    theirOutbound: ob.ok && ob.lanes[0] ? `about ${ob.loadsPerMonth} loads a month, ${ob.lanes[0].dest} ${ob.lanes[0].pct}% of it` : null,
    ourHome: prof.home || "our home base", equipment: prof.equipment[0]?.name === "Dry van" ? "53' dry vans" : "53' reefers", family: prof.families[0]?.name?.toLowerCase() || "food freight",
    deadhead: dh ? `we run back empty from ${dh.city} ${dh.pct}% of the time` : null,
    lanesIn: rel?.lanesIn.length ? rel.lanesIn.map((l) => l.from).join(" and ") : null,
  });
  const [seq] = await db.insert(schema.sequences).values({ accountId, facilityId: f.id, status: "draft", step: 0, summary }).returning();
  await db.insert(schema.touches).values(touches.map((t, i) => ({ sequenceId: seq.id, step: i, channel: SEQUENCE[i].channel, subject: t.subject, body: t.body, status: "draft" })));
  return seq;
}

/* The docks worth writing to, warmest first: real history, no broker hold. */
export async function rankedDocks(accountId: string, limit = 40): Promise<Relationship[]> {
  const db = await getDb();
  const ST = schema.stops;
  const ids = await db.select({ id: ST.facilityId, n: sql<number>`count(distinct ${ST.loadId})` }).from(ST)
    .where(and(eq(ST.accountId, accountId), sql`${ST.facilityId} is not null`)).groupBy(ST.facilityId).orderBy(sql`count(distinct ${ST.loadId}) desc`).limit(limit * 2);
  const out: Relationship[] = [];
  for (const r of ids) { const rel = await relationship(accountId, r.id!); if (rel) out.push(rel); }
  return out.sort((a, b) => b.warmth - a.warmth).slice(0, limit);
}

/* Cron: keep the top docks drafted as the scan fills in. A few per tick. */
export async function prepareTop(accountId: string, n = 3) {
  const db = await getDb();
  const docks = await rankedDocks(accountId, 15);
  const have = new Set((await db.select({ f: schema.sequences.facilityId }).from(schema.sequences).where(eq(schema.sequences.accountId, accountId))).map((r) => r.f));
  let made = 0;
  for (const d of docks) {
    if (have.has(d.facilityId) || d.loads < 2) continue;
    if (!(await dockHolds(accountId, d.facilityId)).clear) continue;          // autopilot never touches a held dock
    try { await prepareDock(accountId, d.facilityId); made++; } catch (e) { console.error("[outreach] draft failed", d.name, (e as Error).message); }
    if (made >= n) break;
  }
  return made;
}

/* Pick the person most likely to award freight. */
const TITLE_RANK = [/transportation/i, /logistics/i, /shipping/i, /traffic/i, /supply chain/i, /distribution/i, /warehouse/i, /operations/i, /procurement|purchasing/i];
export function bestPerson(people: Visible[]) {
  const score = (p: Visible) => { const i = TITLE_RANK.findIndex((re) => re.test(p.title || "")); return (i < 0 ? 20 : i) - (/manager|director|lead|head|vp/i.test(p.title || "") ? 0.5 : 0) - (p.has.email ? 0.2 : 0); };
  return [...people].sort((a, b) => score(a) - score(b))[0] || null;
}

export async function attachContact(accountId: string, sequenceId: string, contactId: string) {
  const db = await getDb();
  const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.accountId, accountId)));
  if (!seq) throw new Error("No sequence");
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
  if (!c || c.facilityId !== seq.facilityId) throw new Error("That person is not at this dock.");
  await db.update(schema.sequences).set({ contactId }).where(eq(schema.sequences.id, sequenceId));
}

async function revealed(accountId: string, contactId: string) {
  const db = await getDb();
  const rows = await db.select({ f: schema.reveals.field }).from(schema.reveals).where(and(eq(schema.reveals.accountId, accountId), eq(schema.reveals.contactId, contactId)));
  return new Set(rows.map((r) => r.f));
}

/* Approve the opener: sends it now and schedules the rest. */
export async function approveOpener(accountId: string, sequenceId: string, edited?: { subject?: string; body?: string }) {
  const db = await getDb();
  const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.accountId, accountId)));
  if (!seq) throw new Error("No sequence");
  const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (!PLANS[acct.plan as PlanId].outreach) throw new Error("Sending is on Carrier and Fleet. Drafting stays free.");
  if (!seq.contactId) throw new Error("Pick a person at this dock first.");
  const hold = await dockHolds(accountId, seq.facilityId);
  if (!hold.clear) throw new Error(hold.reason);
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seq.contactId));
  const has = await revealed(accountId, c.id);
  if (!has.has("email") || !c.email) throw new Error("Reveal a verified email first (1 token).");
  if (c.emailStatus === "bounced") throw new Error("That address bounced. Reveal a new one.");
  const mb = await sendingMailbox(accountId, seq.mailboxId);
  if (!mb) throw new Error("Connect a Gmail or Outlook mailbox to send from.");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.accountId, accountId)).limit(1);
  const signer = await signerOf(mb, user?.name || acct.company);
  const [t] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, 0)));
  const first = has.has("name") && c.name ? c.name.split(" ")[0] : null;
  const subject = personalize(edited?.subject ?? t.subject ?? "Your outbound freight", first, signer);
  const body = personalize(edited?.body ?? t.body, first, signer);
  const { messageId } = await sendAs(mb.id, { to: c.email, subject, text: body });
  await db.update(schema.touches).set({ status: "sent", subject, body, messageId, sentAt: new Date() }).where(eq(schema.touches.id, t.id));
  await db.update(schema.sequences).set({ status: "active", step: 1, threadId: messageId, mailboxId: mb.id, nextAt: new Date(Date.now() + SEQUENCE[1].day * 86400e3) }).where(eq(schema.sequences.id, seq.id));
}

export async function pause(accountId: string, sequenceId: string, on: boolean) {
  const db = await getDb();
  await db.update(schema.sequences).set({ status: on ? "paused" : "active", nextAt: on ? null : new Date() }).where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.accountId, accountId)));
}

/* Runs from cron. Sends due email steps; LinkedIn steps wait for a paste. */
export async function runDueSteps() {
  const db = await getDb();
  const due = await db.select().from(schema.sequences).where(and(eq(schema.sequences.status, "active"), lte(schema.sequences.nextAt, new Date()))).limit(50);
  let sent = 0;
  for (const seq of due) {
    try {
      await checkReply(seq.id);
      const [fresh] = await db.select().from(schema.sequences).where(eq(schema.sequences.id, seq.id));
      if (fresh.status !== "active" || !fresh.contactId) continue;
      if (!(await dockHolds(seq.accountId, seq.facilityId)).clear) { await db.update(schema.sequences).set({ status: "paused", suggested: "Paused: a hold applies to this dock." }).where(eq(schema.sequences.id, seq.id)); continue; }
      const step = fresh.step;
      if (step >= SEQUENCE.length) { await db.update(schema.sequences).set({ status: "done", nextAt: null }).where(eq(schema.sequences.id, seq.id)); continue; }
      const [t] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, step)));
      const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, fresh.contactId));
      const has = await revealed(seq.accountId, c.id);
      const first = has.has("name") && c.name ? c.name.split(" ")[0] : null;
      const mbx = await sendingMailbox(seq.accountId, fresh.mailboxId);
      const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, seq.accountId));
      const signer = await signerOf(mbx, acct.company);
      if (t.channel === "email") {
        const mb = mbx;
        if (!mb || !c.email || c.emailStatus === "bounced") { await db.update(schema.sequences).set({ status: "paused" }).where(eq(schema.sequences.id, seq.id)); continue; }
        const [opener] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, 0)));
        const body = personalize(t.body, first, signer);
        const { messageId } = await sendAs(mb.id, { to: c.email, subject: `Re: ${opener.subject}`, text: body, inReplyTo: seq.threadId || undefined, references: seq.threadId || undefined });
        await db.update(schema.touches).set({ status: "sent", body, messageId, sentAt: new Date() }).where(eq(schema.touches.id, t.id));
        sent++;
      } else {
        await db.update(schema.touches).set({ status: "copied", body: personalize(t.body, first, signer) }).where(eq(schema.touches.id, t.id));   // waits in the queue for the carrier to paste
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

/* A reply stops the sequence, gets labelled, and gets a suggested answer. */
export async function checkReply(sequenceId: string) {
  const db = await getDb();
  const [seq] = await db.select().from(schema.sequences).where(eq(schema.sequences.id, sequenceId));
  if (!seq || seq.status !== "active" || !seq.contactId) return false;
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seq.contactId));
  if (!c.email) return false;
  const mb = await sendingMailbox(seq.accountId, seq.mailboxId);
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
      ourThread: sent.map((s) => `[${s.channel} day ${SEQUENCE[Math.min(s.step, SEQUENCE.length - 1)].day}] ${s.subject ? s.subject + "\n" : ""}${s.body}`).join("\n\n"),
      reply: r.text, profileLine: `we haul ${prof.families[0]?.name ?? "freight"} on ${prof.equipment[0]?.name ?? "trailers"}, home base ${prof.home ?? "unknown"}; ${seq.summary ?? ""}`,
    });
    label = t.label; suggested = t.suggested_reply; checkBack = t.check_back;
  } catch { /* the carrier still sees the reply */ }
  await db.update(schema.sequences).set({
    status: label === "not_now" && checkBack ? "paused" : "replied", replyLabel: label, replyText: r.text, replyAt: r.date, suggested,
    nextAt: label === "not_now" && checkBack ? new Date(checkBack) : null,
  }).where(eq(schema.sequences.id, seq.id));
  return true;
}

export async function sendSuggestedReply(accountId: string, sequenceId: string, body: string) {
  const db = await getDb();
  const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.accountId, accountId)));
  if (!seq?.contactId) throw new Error("No contact on this sequence.");
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, seq.contactId));
  const mb = await sendingMailbox(accountId, seq.mailboxId);
  if (!mb || !c.email) throw new Error("No mailbox or email to send with.");
  const [opener] = await db.select().from(schema.touches).where(and(eq(schema.touches.sequenceId, seq.id), eq(schema.touches.step, 0)));
  await sendAs(mb.id, { to: c.email, subject: `Re: ${opener.subject}`, text: body, inReplyTo: seq.threadId || undefined, references: seq.threadId || undefined });
  await db.insert(schema.touches).values({ sequenceId: seq.id, step: 99, channel: "email", subject: `Re: ${opener.subject}`, body, status: "sent", sentAt: new Date() });
  await db.update(schema.sequences).set({ suggested: null }).where(eq(schema.sequences.id, seq.id));
}

/* Everything the Outreach page shows: one card per dock, warmest first. */
export type Card = {
  facilityId: string; name: string; city: string; rel: Relationship | null; summary: string;
  sequence: (typeof schema.sequences.$inferSelect & { touches: (typeof schema.touches.$inferSelect)[] }) | null;
  people: Visible[]; best: Visible | null; contact: Visible | null; hold: DockHold;
  state: "held" | "needs_draft" | "needs_people" | "needs_email" | "ready" | "active" | "copy" | "replied" | "paused" | "done";
};
export async function cards(accountId: string): Promise<Card[]> {
  const db = await getDb();
  const docks = await rankedDocks(accountId, 40);
  const seqs = await db.select().from(schema.sequences).where(eq(schema.sequences.accountId, accountId)).orderBy(desc(schema.sequences.createdAt));
  const byFac = new Map(seqs.map((s) => [s.facilityId, s]));
  /* docks with a sequence but no longer in the top list (lookalikes, older) still show */
  const ids = [...new Set([...docks.map((d) => d.facilityId), ...seqs.map((s) => s.facilityId)])];
  const facs = ids.length ? await db.select().from(schema.facilities).where(inArray(schema.facilities.id, ids)) : [];
  const people = await visibleContacts(accountId, ids);
  const touchesAll = seqs.length ? await db.select().from(schema.touches).where(inArray(schema.touches.sequenceId, seqs.map((s) => s.id))).orderBy(asc(schema.touches.step)) : [];
  const out: Card[] = [];
  for (const fid of ids) {
    const f = facs.find((x) => x.id === fid); if (!f) continue;
    const rel = docks.find((d) => d.facilityId === fid) || (await relationship(accountId, fid));
    const s = byFac.get(fid) || null;
    const ps = people[fid] || [];
    const contact = s?.contactId ? ps.find((p) => p.id === s.contactId) || null : null;
    const best = contact || bestPerson(ps);
    const hold = await dockHolds(accountId, fid);
    let state: Card["state"] = "needs_draft";
    if (!hold.clear && (!s || ["draft", "active"].includes(s.status))) state = "held";
    else if (s) {
      if (s.status === "replied") state = "replied";
      else if (s.status === "paused") state = "paused";
      else if (s.status === "done") state = "done";
      else if (s.status === "active") state = touchesAll.find((t) => t.sequenceId === s.id && t.step === s.step)?.status === "copied" ? "copy" : "active";
      else if (!ps.length) state = "needs_people";
      else if (!contact?.email && !(best && best.email)) state = "needs_email";
      else state = "ready";
    }
    out.push({ facilityId: fid, name: f.name, city: `${f.city}, ${f.state}`, rel, summary: s?.summary || (rel ? relationshipLine(rel) : ""),
      sequence: s ? { ...s, touches: touchesAll.filter((t) => t.sequenceId === s.id) } : null, people: ps, best, contact, hold, state });
  }
  const order: Record<Card["state"], number> = { replied: 0, ready: 1, copy: 2, needs_email: 3, needs_people: 4, needs_draft: 5, active: 6, paused: 7, held: 8, done: 9 };
  return out.sort((a, b) => order[a.state] - order[b.state] || (b.rel?.warmth ?? 0) - (a.rel?.warmth ?? 0));
}


/* ---------- autopilot ----------
   The sales agent. Runs from cron for accounts set to "send": takes the
   warmest clear docks that have no sequence running, finds the people
   (free), reveals the best-titled person's name and email (tokens, inside
   the daily cap), attaches them, and sends the opener from the account's
   sending mailbox. Follow-ups and reply handling are already automatic.
   Never a held dock, never past autoPerDay, never on Free. */
export async function autopilotTick(accountId: string) {
  const db = await getDb();
  const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (!acct || acct.autopilot !== "send") return { started: 0, reason: "off" };
  if (!PLANS[acct.plan as PlanId].outreach) return { started: 0, reason: "plan" };
  const mb = await sendingMailbox(accountId);
  if (!mb) return { started: 0, reason: "no mailbox" };
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const [today] = await db.select({ n: sql<number>`count(*)` }).from(schema.touches).innerJoin(schema.sequences, eq(schema.touches.sequenceId, schema.sequences.id))
    .where(and(eq(schema.sequences.accountId, accountId), eq(schema.touches.step, 0), eq(schema.touches.status, "sent"), sql`${schema.touches.sentAt} >= ${dayStart}`));
  let budget = acct.autoPerDay - Number(today?.n || 0);
  if (budget <= 0) return { started: 0, reason: "daily limit" };
  const { discover, reveal, visibleContacts } = await import("@/lib/enrich");
  const docks = (await rankedDocks(accountId, 25)).filter((d) => d.deliveries >= 3);
  let started = 0;
  for (const d of docks) {
    if (budget <= 0) break;
    const [s] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.accountId, accountId), eq(schema.sequences.facilityId, d.facilityId)));
    if (s && s.status !== "draft") continue;
    if (!(await dockHolds(accountId, d.facilityId)).clear) continue;
    try {
      const seq = s || await prepareDock(accountId, d.facilityId);
      let people = (await visibleContacts(accountId, [d.facilityId]))[d.facilityId] || [];
      if (!people.length) { await discover(d.facilityId); people = (await visibleContacts(accountId, [d.facilityId]))[d.facilityId] || []; }
      const best = bestPerson(people);
      if (!best) continue;
      if (!best.name) { const r = await reveal(accountId, best.id, "name"); if (!r.found) continue; }
      if (!best.email) { const r = await reveal(accountId, best.id, "email"); if (!r.found) continue; }
      await attachContact(accountId, seq.id, best.id);
      await approveOpener(accountId, seq.id);
      started++; budget--;
    } catch (e) {
      /* a token cap or a missing provider stops the run quietly; the card shows the state */
      console.error("[autopilot]", d.name, (e as Error).message);
      if (/cap|tokens|provider/i.test((e as Error).message)) break;
    }
  }
  return { started };
}
