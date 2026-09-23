import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { spend, refund, TokenError } from "@/lib/tokens";
import { REVEAL_COST } from "@/lib/plans";
import { stateName } from "@/lib/freight/states";
import { findymail } from "./findymail";
import { pdl } from "./pdl";
import { leadmagic, prospeo, wiza } from "./others";
import type { Provider } from "./types";

/* Contacts are facility-level people. Discovery (who works there, with
   titles) is free and cached on the facility. Each field a carrier wants to
   see costs one token: name, LinkedIn, email, phone. A field already on
   file (found by discovery or paid for by another carrier) still costs the
   token but needs no lookup. A miss costs nothing. */

const EMAIL_ORDER: Provider[] = [findymail, leadmagic, wiza, pdl, prospeo];
const PHONE_ORDER: Provider[] = [pdl, leadmagic, wiza, findymail, prospeo];
export const PEOPLE_ORDER: Provider[] = [pdl];
const DOMAIN_ORDER: Provider[] = [pdl];
/* Two kinds of people. HQ books freight for the whole company and usually sits at head
   office, not at the warehouse we back into. Site runs the building. We look for both. */
export const HQ_TITLES = ["transportation", "logistics", "supply chain", "traffic", "procurement", "purchasing", "freight", "distribution"];
export const SITE_TITLES = ["warehouse", "shipping", "receiving", "distribution", "operations", "plant"];
export const TITLES = [...new Set([...HQ_TITLES, ...SITE_TITLES])];
export const companyKeyOf = (f: { domain: string | null; shipper: string | null; name: string }) => f.domain || (f.shipper || f.name).toLowerCase().replace(/\b(llc|inc|corp|co|ltd|company|dc|distribution center|warehouse)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export const providersReady = () => [...new Set([...EMAIL_ORDER, ...PHONE_ORDER, ...PEOPLE_ORDER])].filter((p) => p.ready()).map((p) => p.id);
export type Field = "name" | "linkedin" | "email" | "phone";
export const labelFor = (f: Field) => ({ name: "Name", linkedin: "LinkedIn profile", email: "Verified email", phone: "Direct phone" }[f]);

async function domainFor(facility: typeof schema.facilities.$inferSelect) {
  if (facility.domain) return facility.domain;
  const company = facility.shipper || facility.name;
  for (const p of DOMAIN_ORDER) if (p.ready() && p.findDomain) {
    const d = await p.findDomain(company);
    if (d) {
      const host = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const db = await getDb();
      await db.update(schema.facilities).set({ domain: host, companyKey: host }).where(eq(schema.facilities.id, facility.id));
      return host;
    }
  }
  return null;
}

/* The other warehouses of the same company, so head-office people are shared and looked up once. */
async function siblings(f: typeof schema.facilities.$inferSelect) {
  const db = await getDb();
  const key = f.companyKey || companyKeyOf(f);
  if (!f.companyKey) await db.update(schema.facilities).set({ companyKey: key }).where(eq(schema.facilities.id, f.id));
  if (!key) return [];
  return (await db.select({ id: schema.facilities.id }).from(schema.facilities).where(eq(schema.facilities.companyKey, key))).map((r) => r.id).filter((id) => id !== f.id);
}

/* Free: who books freight at this company (head office) and who runs this warehouse. Cached 90 days. */
export async function discover(facilityId: string) {
  const db = await getDb();
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId));
  if (!f) throw new Error("Unknown facility");
  const fresh = f.discoveredAt && Date.now() - f.discoveredAt.getTime() < 90 * 86400e3;
  if (fresh) return { people: await peopleAt(facilityId), cached: true };
  if (!PEOPLE_ORDER.some((p) => p.ready())) throw new Error("No people provider is configured yet (People Data Labs key).");
  const domain = await domainFor(f);
  const company = f.shipper || f.name;
  const sibs = await siblings(f);
  const hqKnown = sibs.length ? (await db.select({ n: sql<number>`count(*)` }).from(schema.contacts).where(and(inArray(schema.contacts.facilityId, sibs), eq(schema.contacts.scope, "hq")))) : [{ n: 0 }];
  type Found = { name: string; title: string | null; linkedin: string | null; email: string | null; phone: string | null; scope: "hq" | "site" };
  const found: Found[] = [];
  const near = { city: f.city, stateName: stateName(f.state) || f.state };
  for (const p of PEOPLE_ORDER) if (p.ready() && p.findPeople) {
    /* Head office: company-wide, once per company. Site: people in this state with warehouse titles. */
    if (Number(hqKnown[0]?.n || 0) === 0) { const r = await p.findPeople(company, domain, HQ_TITLES, 6); for (const x of r || []) if (x.name) found.push({ name: x.name, title: x.title ?? null, linkedin: x.linkedin ?? null, email: x.email ?? null, phone: x.phone ?? null, scope: "hq" }); }
    if (f.type !== "company") { const r = await p.findPeople(company, domain, SITE_TITLES, 4, near); for (const x of r || []) if (x.name && !found.some((y) => y.name.toLowerCase() === x.name!.toLowerCase())) found.push({ name: x.name, title: x.title ?? null, linkedin: x.linkedin ?? null, email: x.email ?? null, phone: x.phone ?? null, scope: "site" }); }
    if (found.length) break;
  }
  const existing = await db.select().from(schema.contacts).where(eq(schema.contacts.facilityId, facilityId));
  for (const x of found) {
    const dup = existing.find((e) => e.name && e.name.toLowerCase() === x.name.toLowerCase());
    if (dup) { await db.update(schema.contacts).set({ title: dup.title ?? x.title, linkedin: dup.linkedin ?? x.linkedin, email: dup.email ?? x.email, emailStatus: dup.email ? dup.emailStatus : x.email ? "verified" : null, phone: dup.phone ?? x.phone, scope: x.scope }).where(eq(schema.contacts.id, dup.id)); continue; }
    await db.insert(schema.contacts).values({ facilityId, name: x.name, title: x.title, linkedin: x.linkedin, email: x.email, emailStatus: x.email ? "verified" : null, phone: x.phone, scope: x.scope, source: { discovery: "peopledatalabs" } });
  }
  await db.update(schema.facilities).set({ discoveredAt: new Date() }).where(eq(schema.facilities.id, facilityId));
  return { people: await peopleAt(facilityId), cached: false };
}

/* People for one warehouse: its own, plus head-office people found through any warehouse of the same company. */
export async function peopleAt(facilityId: string) {
  const db = await getDb();
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId));
  if (!f) return [];
  const own = await db.select().from(schema.contacts).where(eq(schema.contacts.facilityId, facilityId));
  const sibs = await siblings(f);
  const shared = sibs.length ? await db.select().from(schema.contacts).where(and(inArray(schema.contacts.facilityId, sibs), eq(schema.contacts.scope, "hq"))) : [];
  const seen = new Set(own.map((c) => (c.name || "").toLowerCase()));
  return [...own, ...shared.filter((c) => c.name && !seen.has(c.name.toLowerCase()))];
}

/* What this carrier can see of a person: masked unless revealed. */
export type Visible = { id: string; facilityId: string; scope: "hq" | "site"; title: string | null; name: string | null; linkedin: string | null; email: string | null; emailStatus: string | null; phone: string | null; has: Record<Field, boolean> };
export async function visibleContacts(accountId: string, facilityIds: string[]): Promise<Record<string, Visible[]>> {
  const db = await getDb();
  const out: Record<string, Visible[]> = {};
  if (!facilityIds.length) return out;
  const mine = await db.select().from(schema.reveals).where(eq(schema.reveals.accountId, accountId));
  const seen = new Set(mine.map((r) => `${r.contactId}:${r.field}`));
  for (const fid of facilityIds) {
    const rows = await peopleAt(fid);
    out[fid] = rows.map((c) => ({
      id: c.id, facilityId: fid, scope: (c.scope === "hq" ? "hq" : "site"), title: c.title,
      name: seen.has(`${c.id}:name`) ? c.name : null,
      linkedin: seen.has(`${c.id}:linkedin`) ? c.linkedin : null,
      email: seen.has(`${c.id}:email`) ? c.email : null, emailStatus: c.emailStatus,
      phone: seen.has(`${c.id}:phone`) ? c.phone : null,
      has: { name: !!c.name, linkedin: !!c.linkedin, email: !!c.email && c.emailStatus !== "bounced", phone: !!c.phone },
    }));
  }
  return out;
}

/* Who someone is (name, title, LinkedIn) is one token together; an email is one; a phone is three.
   Charged only when there is something to show. */
export async function reveal(accountId: string, contactId: string, field: Field) {
  const db = await getDb();
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
  if (!c) throw new Error("Unknown contact");
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, c.facilityId));
  const already = await db.select().from(schema.reveals).where(and(eq(schema.reveals.accountId, accountId), eq(schema.reveals.contactId, contactId), eq(schema.reveals.field, field)));
  if (already.length) return { found: true, value: c[field], charged: 0 };
  if (field !== "name" && !c.name) throw new Error("This person has no name on file yet.");
  const who = c.name || "a contact";
  const cost = REVEAL_COST[field];
  const split = await spend(accountId, cost, `${labelFor(field)} — ${who} at ${f.name}`, contactId);
  try {
    let value: string | null = c[field] && !(field === "email" && c.emailStatus === "bounced") ? c[field] : null;
    let by = "";
    if (!value) {
      if (field === "email") {
        const domain = await domainFor(f);
        if (!domain) throw new Error("Could not work out this company's email domain.");
        for (const p of EMAIL_ORDER) if (p.ready() && p.findEmail) { const r = await p.findEmail(c.name!, domain); if (r) { value = r; by = p.id; break; } }
      } else if (field === "phone") {
        for (const p of PHONE_ORDER) if (p.ready() && p.findPhone) { const r = await p.findPhone(c.name!, f.shipper || f.name, c.linkedin); if (r) { value = r; by = p.id; break; } }
      } else if (field === "linkedin") {
        const domain = await domainFor(f);
        for (const p of PEOPLE_ORDER) if (p.ready() && p.findPeople) { const r = await p.findPeople(f.shipper || f.name, domain, [c.name!], 1); if (r?.[0]?.linkedin) { value = r[0].linkedin; by = p.id; break; } }
      }
    }
    if (!value) { await refund(accountId, cost, `No result — ${labelFor(field)} for ${who} at ${f.name}`, contactId, split); return { found: false, value: null, charged: 0 }; }
    if (by) {
      const source = { ...((c.source as Record<string, string>) || {}), [field]: by };
      const patch: Partial<typeof schema.contacts.$inferInsert> = { source };
      if (field === "linkedin") patch.linkedin = value;
      if (field === "email") { patch.email = value; patch.emailStatus = "verified"; }
      if (field === "phone") patch.phone = value;
      await db.update(schema.contacts).set(patch).where(eq(schema.contacts.id, c.id));
    }
    await db.insert(schema.reveals).values({ accountId, contactId, field }).onConflictDoNothing();
    if (field === "name") await db.insert(schema.reveals).values({ accountId, contactId, field: "linkedin" }).onConflictDoNothing();   // LinkedIn rides along with the name
    return { found: true, value, charged: cost };
  } catch (e) {
    if (!(e instanceof TokenError)) await refund(accountId, cost, `Refund — ${labelFor(field)} for ${who} (${(e as Error).message})`, contactId, split);
    throw e;
  }
}

/* A bounced email is refunded to whoever paid for it and never sent to again. */
export async function reportBounce(accountId: string, contactId: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
  if (!c || c.emailStatus === "bounced") return;
  await db.update(schema.contacts).set({ emailStatus: "bounced" }).where(eq(schema.contacts.id, contactId));
  const paid = await db.select().from(schema.reveals).where(and(eq(schema.reveals.accountId, accountId), eq(schema.reveals.contactId, contactId), eq(schema.reveals.field, "email")));
  if (paid.length) await refund(accountId, REVEAL_COST.email, "Bounced email refunded", contactId);
}
