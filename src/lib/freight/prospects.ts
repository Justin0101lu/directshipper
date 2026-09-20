import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { outboundFor, type Outbound } from "./network";
import { computeProfile } from "./profile";

/* Prospects: one list, warmest first.
   Receivers  - docks the carrier already delivers to. Free.
   Lookalikes - docks in the network shipping freight like theirs. 1 token each. */

export type Receiver = {
  facilityId: string; name: string; city: string; deliveries: number; lastAt: string | null;
  outbound: Outbound; standing: "clear" | "thin" | "none" | "hold"; why: string; contactId: string | null;
};

async function activeBrokers(accountId: string) {
  const db = await getDb();
  const since = new Date(Date.now() - 365 * 86400e3);
  const rows = await db.select({ b: schema.loads.broker }).from(schema.loads).where(and(eq(schema.loads.accountId, accountId), gte(schema.loads.pickupAt, since))).groupBy(schema.loads.broker);
  return rows.map((r) => r.b).filter(Boolean) as string[];
}

export async function receivers(accountId: string): Promise<Receiver[]> {
  const db = await getDb();
  const L = schema.loads;
  const rows = await db.select({ id: L.destId, n: sql<number>`count(*)`, last: sql<Date>`max(${L.pickupAt})` })
    .from(L).where(and(eq(L.accountId, accountId), sql`${L.destId} is not null`)).groupBy(L.destId).orderBy(sql`count(*) desc`).limit(40);
  const brokers = await activeBrokers(accountId);
  const out: Receiver[] = [];
  for (const r of rows) {
    const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, r.id!));
    if (!f) continue;
    const ob = await outboundFor(f.id, accountId);
    /* Broker hold: one of the carrier's current brokers tenders loads that originate here. */
    let hold = false;
    if (brokers.length) {
      const [h] = await db.select({ c: sql<number>`count(*)` }).from(L).where(and(eq(L.accountId, accountId), eq(L.originId, f.id), inArray(L.broker, brokers)));
      hold = Number(h?.c || 0) > 0;
    }
    const deliveries = Number(r.n);
    let standing: Receiver["standing"] = "clear", why = "";
    if (hold) { standing = "hold"; why = "A broker you still work with tenders freight out of this dock. Hidden from outreach."; }
    else if (!ob.ok) { standing = "thin"; why = `You deliver here ${deliveries} times. Not enough unrelated carriers have seen this dock to say what it ships out; ask at the window.`; }
    else if (ob.loadsPerMonth < 5) { standing = "thin"; why = `Ships about ${ob.loadsPerMonth} loads a month outbound. Worth a call, not a plan.`; }
    else { why = `You deliver here ${deliveries} times. Ships about ${ob.loadsPerMonth}/mo outbound${ob.lanes[0] ? ", " + ob.lanes[0].pct + "% toward " + ob.lanes[0].dest : ""}. No broker put you in this relationship.`; }
    const [c] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(eq(schema.contacts.accountId, accountId), eq(schema.contacts.facilityId, f.id))).limit(1);
    out.push({ facilityId: f.id, name: f.name, city: `${f.city}, ${f.state}`, deliveries, lastAt: r.last ? new Date(r.last).toISOString().slice(0, 10) : null, outbound: ob, standing, why, contactId: c?.id ?? null });
  }
  return out.filter((r) => r.standing !== "hold").sort((a, b) => (a.standing === "clear" ? 0 : 1) - (b.standing === "clear" ? 0 : 1) || b.deliveries - a.deliveries);
}

export type Lookalike = { facilityId: string; name: string; city: string; family: string | null; equipment: string | null; loadsPerMonth: number; match: "VERIFIED" | "OBSERVED"; revealed: boolean; contactId: string | null };

/* Candidates: network origins with the carrier's top family + equipment, in
   a comparable length-of-haul band, that this carrier has never touched and
   that none of their active brokers move. Excluded count is shown. */
export async function lookalikes(accountId: string, opts: { originState?: string; equipment?: string; family?: string; minPerMonth?: number } = {}) {
  const db = await getDb();
  const L = schema.loads, F = schema.facilities;
  const prof = await computeProfile(accountId);
  const family = opts.family || (prof.families[0]?.name.startsWith("Frozen") ? "frozen" : prof.families[0]?.name.startsWith("Fresh") ? "produce" : "dry");
  const equipment = opts.equipment || (prof.equipment[0]?.name === "Dry van" ? "dry_van" : prof.equipment[0]?.name === "Flatbed" ? "flatbed" : "reefer");
  const mine = (await db.select({ id: L.originId }).from(L).where(and(eq(L.accountId, accountId), sql`${L.originId} is not null`)).groupBy(L.originId)).map((r) => r.id!);
  const mineDest = (await db.select({ id: L.destId }).from(L).where(and(eq(L.accountId, accountId), sql`${L.destId} is not null`)).groupBy(L.destId)).map((r) => r.id!);
  const brokers = await activeBrokers(accountId);

  const conds = [ne(L.accountId, accountId), eq(L.family, family), eq(L.equipment, equipment), sql`${L.originId} is not null`];
  if (opts.originState) conds.push(eq(L.originState, opts.originState.toUpperCase()));
  const known = [...mine, ...mineDest];
  if (known.length) conds.push(notInArray(L.originId, known));
  const cands = await db.select({ id: L.originId, n: sql<number>`count(*)`, accounts: sql<number>`count(distinct ${L.accountId})` })
    .from(L).where(and(...conds)).groupBy(L.originId).orderBy(sql`count(*) desc`).limit(60);

  const out: Lookalike[] = [];
  let excluded = 0;
  for (const c of cands) {
    const ob = await outboundFor(c.id!, accountId);
    if (!ob.ok) continue;
    if (ob.loadsPerMonth < (opts.minPerMonth ?? 4)) continue;
    /* Broker relationship exclusion: the carrier's active brokers tender out of this dock (seen anywhere in the network). */
    if (brokers.length) {
      const [h] = await db.select({ c: sql<number>`count(*)` }).from(L).where(and(eq(L.originId, c.id!), inArray(L.broker, brokers)));
      if (Number(h?.c || 0) > 0) { excluded++; continue; }
    }
    const [f] = await db.select().from(F).where(eq(F.id, c.id!));
    if (!f) continue;
    const [p] = await db.select().from(schema.prospects).where(and(eq(schema.prospects.accountId, accountId), eq(schema.prospects.facilityId, f.id))).limit(1);
    const [ct] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(eq(schema.contacts.accountId, accountId), eq(schema.contacts.facilityId, f.id))).limit(1);
    out.push({ facilityId: f.id, name: p?.revealedAt ? f.name : "", city: `${f.city}, ${f.state}`, family: ob.family, equipment: ob.equipment, loadsPerMonth: ob.loadsPerMonth,
      match: Number(c.accounts) >= 5 ? "VERIFIED" : "OBSERVED", revealed: !!p?.revealedAt, contactId: ct?.id ?? null });
    if (out.length >= 25) break;
  }
  return { family, equipment, rows: out, excluded, thin: cands.length < 3 };
}

export async function revealLookalike(accountId: string, facilityId: string) {
  const db = await getDb();
  await db.insert(schema.prospects).values({ accountId, facilityId, kind: "lookalike", revealedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.prospects.accountId, schema.prospects.facilityId], set: { revealedAt: new Date() } });
}

export async function recentLoads(accountId: string, limit = 500) {
  const db = await getDb();
  return db.select().from(schema.loads).where(eq(schema.loads.accountId, accountId)).orderBy(desc(schema.loads.pickupAt)).limit(limit);
}
