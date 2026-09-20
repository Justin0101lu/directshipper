import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { spend, refund, TokenError } from "@/lib/tokens";
import { findymail } from "./findymail";
import { pdl } from "./pdl";
import { leadmagic, prospeo, wiza } from "./others";
import type { Provider } from "./types";

/* The waterfall. Order is the order on the landing page. First verified
   result wins; a miss costs nothing. Providers without a key are skipped. */
const EMAIL_ORDER: Provider[] = [findymail, leadmagic, wiza, pdl, prospeo];
const PHONE_ORDER: Provider[] = [pdl, leadmagic, wiza, findymail, prospeo];
const PERSON_ORDER: Provider[] = [pdl];
const DOMAIN_ORDER: Provider[] = [pdl];
const TITLES = ["transportation", "logistics", "shipping", "traffic", "supply chain", "warehouse", "distribution", "operations"];

export const providersReady = () => [...new Set([...EMAIL_ORDER, ...PHONE_ORDER])].filter((p) => p.ready()).map((p) => p.id);

export type Field = "name" | "linkedin" | "email" | "phone";

async function domainFor(facility: typeof schema.facilities.$inferSelect) {
  if (facility.domain) return facility.domain;
  const company = facility.shipper || facility.name;
  for (const p of DOMAIN_ORDER) if (p.ready() && p.findDomain) {
    const d = await p.findDomain(company);
    if (d) {
      const host = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const db = await getDb();
      await db.update(schema.facilities).set({ domain: host }).where(eq(schema.facilities.id, facility.id));
      return host;
    }
  }
  return null;
}

/* Reveal one field for one facility. Charges 1 token only on a verified hit. */
export async function reveal(accountId: string, facilityId: string, field: Field) {
  const db = await getDb();
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId));
  if (!f) throw new Error("Unknown facility");
  let [c] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.accountId, accountId), eq(schema.contacts.facilityId, facilityId))).limit(1);
  if (!c) [c] = await db.insert(schema.contacts).values({ accountId, facilityId, source: {} }).returning();
  if (c[field]) return { found: true, value: c[field], charged: 0 };
  if (!providersReady().length) throw new Error("No contact provider is configured yet. Add a Findymail or People Data Labs key.");

  /* Pre-authorize the token so a cap or empty balance stops us before we pay a provider. */
  await spend(accountId, 1, `${labelFor(field)} — ${f.name}`, facilityId);
  const source = (c.source as Record<string, string>) || {};
  const company = f.shipper || f.name;
  try {
    let value: string | null = null, by = "";
    if (field === "name") {
      const domain = await domainFor(f);
      for (const p of PERSON_ORDER) if (p.ready() && p.findPerson) { const r = await p.findPerson(company, domain, TITLES); if (r?.name) { value = r.title ? `${r.name} — ${r.title}` : r.name; by = p.id;
        await db.update(schema.contacts).set({ name: r.name, title: r.title ?? null, linkedin: c.linkedin ?? r.linkedin ?? null }).where(eq(schema.contacts.id, c.id)); break; } }
    } else if (field === "linkedin") {
      if (!c.name) throw new Error("Reveal the name first.");
      const domain = await domainFor(f);
      for (const p of PERSON_ORDER) if (p.ready() && p.findPerson) { const r = await p.findPerson(company, domain, [c.title || c.name!]); if (r?.linkedin) { value = r.linkedin; by = p.id; break; } }
    } else if (field === "email") {
      if (!c.name) throw new Error("Reveal the name first.");
      const domain = await domainFor(f);
      if (!domain) throw new Error("Could not work out this company's email domain.");
      for (const p of EMAIL_ORDER) if (p.ready() && p.findEmail) { const r = await p.findEmail(c.name!, domain); if (r) { value = r; by = p.id; break; } }
    } else if (field === "phone") {
      if (!c.name) throw new Error("Reveal the name first.");
      for (const p of PHONE_ORDER) if (p.ready() && p.findPhone) { const r = await p.findPhone(c.name!, company, c.linkedin); if (r) { value = r; by = p.id; break; } }
    }
    if (!value) { await refund(accountId, 1, `No result — ${labelFor(field)} at ${f.name}`, facilityId); return { found: false, value: null, charged: 0 }; }
    source[field] = by;
    const patch: Partial<typeof schema.contacts.$inferInsert> = { source };
    if (field === "linkedin") patch.linkedin = value;
    if (field === "email") { patch.email = value; patch.emailStatus = "verified"; }
    if (field === "phone") patch.phone = value;
    await db.update(schema.contacts).set(patch).where(eq(schema.contacts.id, c.id));
    return { found: true, value, charged: 1 };
  } catch (e) {
    if (!(e instanceof TokenError)) await refund(accountId, 1, `Refund — ${labelFor(field)} at ${f.name} (${(e as Error).message})`, facilityId);
    throw e;
  }
}

export function labelFor(f: Field) {
  return { name: "Name and job title", linkedin: "LinkedIn profile", email: "Verified email", phone: "Direct phone" }[f];
}

/* A bounced email is refunded and marked so it never gets sent to again. */
export async function reportBounce(accountId: string, contactId: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.accountId, accountId)));
  if (!c || c.emailStatus === "bounced") return;
  await db.update(schema.contacts).set({ emailStatus: "bounced" }).where(eq(schema.contacts.id, contactId));
  await refund(accountId, 1, "Bounced email refunded", contactId);
}
