import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { outboundFor, type Outbound } from "./network";
import { computeProfile } from "./profile";

/* Prospects: one list, warmest first.
   Receivers  - docks the carrier already delivers to. Free.
   Lookalikes - docks in the network shipping freight like theirs. 1 token each. */

export type Receiver = {
  facilityId: string; name: string; city: string; deliveries: number; lastAt: string | null;
  outbound: Outbound; standing: "clear" | "thin" | "none" | "hold"; why: string; pickups: number;
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
  const ST = schema.stops;
  const rows = await db.select({ id: ST.facilityId, n: sql<number>`count(distinct ${ST.loadId})`, last: sql<Date>`max(${ST.at})` })
    .from(ST).where(and(eq(ST.accountId, accountId), eq(ST.kind, "drop"), sql`${ST.facilityId} is not null`)).groupBy(ST.facilityId).orderBy(sql`count(distinct ${ST.loadId}) desc`).limit(40);
  const brokers = await activeBrokers(accountId);
  const out: Receiver[] = [];
  for (const r of rows) {
    const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, r.id!));
    if (!f) continue;
    const ob = await outboundFor(f.id, accountId);
    /* Broker hold: one of the carrier's current brokers tenders loads that originate here. */
    let hold = false;
    if (brokers.length) {
      const [h] = await db.select({ c: sql<number>`count(*)` }).from(L).where(and(eq(L.accountId, accountId), inArray(L.broker, brokers),
        sql`exists (select 1 from ${schema.stops} s where s.load_id = ${L.id} and s.kind = 'pickup' and s.facility_id = ${f.id})`));
      hold = Number(h?.c || 0) > 0;
    }
    const deliveries = Number(r.n);
    let standing: Receiver["standing"] = "clear", why = "";
    if (hold) { standing = "hold"; why = "A broker you still work with tenders freight out of this dock. Hidden from outreach."; }
    else if (!ob.ok) { standing = "thin"; why = `You deliver here ${deliveries} times. Not enough unrelated carriers have seen this dock to say what it ships out; ask at the window.`; }
    else if (ob.loadsPerMonth < 5) { standing = "thin"; why = `Ships about ${ob.loadsPerMonth} loads a month outbound. Worth a call, not a plan.`; }
    else { why = `You deliver here ${deliveries} times. Ships about ${ob.loadsPerMonth}/mo outbound${ob.lanes[0] ? ", " + ob.lanes[0].pct + "% toward " + ob.lanes[0].dest : ""}. No broker put you in this relationship.`; }
    const [pk] = await db.select({ n: sql<number>`count(distinct ${ST.loadId})` }).from(ST).where(and(eq(ST.accountId, accountId), eq(ST.kind, "pickup"), eq(ST.facilityId, f.id)));
    out.push({ facilityId: f.id, name: f.name, city: `${f.city}, ${f.state}`, deliveries, lastAt: r.last ? new Date(r.last).toISOString().slice(0, 10) : null, outbound: ob, standing, why, pickups: Number(pk?.n || 0) });
  }
  return out.filter((r) => r.standing !== "hold").sort((a, b) => (a.standing === "clear" ? 0 : 1) - (b.standing === "clear" ? 0 : 1) || b.deliveries - a.deliveries);
}

export type Lookalike = { facilityId: string; name: string; city: string; family: string | null; equipment: string | null; loadsPerMonth: number; match: "VERIFIED" | "OBSERVED"; revealed: boolean };

/* Candidates: network origins with the carrier's top family + equipment, in
   a comparable length-of-haul band, that this carrier has never touched and
   that none of their active brokers move. Excluded count is shown. */
export async function lookalikes(accountId: string, opts: { originState?: string; equipment?: string; family?: string; minPerMonth?: number } = {}) {
  const db = await getDb();
  const L = schema.loads, F = schema.facilities;
  const prof = await computeProfile(accountId);
  const family = opts.family || (prof.families[0]?.name.startsWith("Frozen") ? "frozen" : prof.families[0]?.name.startsWith("Fresh") ? "produce" : "dry");
  const equipment = opts.equipment || (prof.equipment[0]?.name === "Dry van" ? "dry_van" : prof.equipment[0]?.name === "Flatbed" ? "flatbed" : "reefer");
  const ST = schema.stops;
  /* Every dock this carrier has touched, as a pickup or a drop. */
  const known = (await db.select({ id: ST.facilityId }).from(ST).where(and(eq(ST.accountId, accountId), sql`${ST.facilityId} is not null`)).groupBy(ST.facilityId)).map((r) => r.id!);
  const brokers = await activeBrokers(accountId);

  const conds = [ne(L.accountId, accountId), eq(L.family, family), eq(L.equipment, equipment), eq(ST.kind, "pickup"), sql`${ST.facilityId} is not null`];
  if (opts.originState) conds.push(eq(ST.state, opts.originState.toUpperCase()));
  if (known.length) conds.push(notInArray(ST.facilityId, known));
  const cands = await db.select({ id: ST.facilityId, n: sql<number>`count(*)`, accounts: sql<number>`count(distinct ${L.accountId})` })
    .from(ST).innerJoin(L, eq(ST.loadId, L.id)).where(and(...conds)).groupBy(ST.facilityId).orderBy(sql`count(*) desc`).limit(60);

  const out: Lookalike[] = [];
  let excluded = 0;
  for (const c of cands) {
    const ob = await outboundFor(c.id!, accountId);
    if (!ob.ok) continue;
    if (ob.loadsPerMonth < (opts.minPerMonth ?? 4)) continue;
    /* Broker relationship exclusion: the carrier's active brokers tender out of this dock (seen anywhere in the network). */
    if (brokers.length) {
      const [h] = await db.select({ c: sql<number>`count(*)` }).from(L).where(and(inArray(L.broker, brokers),
        sql`exists (select 1 from ${ST} s where s.load_id = ${L.id} and s.kind = 'pickup' and s.facility_id = ${c.id!})`));
      if (Number(h?.c || 0) > 0) { excluded++; continue; }
    }
    const [f] = await db.select().from(F).where(eq(F.id, c.id!));
    if (!f) continue;
    const [p] = await db.select().from(schema.prospects).where(and(eq(schema.prospects.accountId, accountId), eq(schema.prospects.facilityId, f.id))).limit(1);
    out.push({ facilityId: f.id, name: p?.revealedAt ? f.name : "", city: `${f.city}, ${f.state}`, family: ob.family, equipment: ob.equipment, loadsPerMonth: ob.loadsPerMonth,
      match: Number(c.accounts) >= 5 ? "VERIFIED" : "OBSERVED", revealed: !!p?.revealedAt });
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
