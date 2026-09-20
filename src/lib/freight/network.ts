import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/* Network observations: what all carriers together have seen at a warehouse.
   Published only once K unrelated accounts have moved freight through it,
   so no single carrier's loads can be traced back. Below K we show
   "not enough observations" rather than a number. */
export const K = Number(process.env.NETWORK_K || 3);

export type Outbound = { ok: true; loadsPerMonth: number; accounts: number; lanes: { dest: string; pct: number }[]; equipment: string | null; family: string | null } | { ok: false; accounts: number };

export async function outboundFor(facilityId: string, excludeAccountId?: string): Promise<Outbound> {
  const db = await getDb();
  const L = schema.loads, ST = schema.stops;
  /* Any load with a pickup stop at this dock counts, whichever stop it was. */
  const pickedHere = sql`exists (select 1 from ${ST} s where s.load_id = ${L.id} and s.kind = 'pickup' and s.facility_id = ${facilityId})`;
  const where = excludeAccountId ? and(pickedHere, ne(L.accountId, excludeAccountId)) : pickedHere;
  const [agg] = await db.select({
    accounts: sql<number>`count(distinct ${L.accountId})`, n: sql<number>`count(*)`,
    first: sql<Date>`min(${L.pickupAt})`, last: sql<Date>`max(${L.pickupAt})`,
  }).from(L).where(where);
  const accounts = Number(agg?.accounts || 0);
  if (accounts < K) return { ok: false, accounts };
  const n = Number(agg.n);
  const months = Math.max(1, (new Date(agg.last).getTime() - new Date(agg.first).getTime()) / (30 * 86400e3));
  const lanes = await db.select({ dest: sql<string>`concat(${L.destCity}, ' ', ${L.destState})`, c: sql<number>`count(*)` }).from(L).where(where).groupBy(L.destCity, L.destState).orderBy(sql`count(*) desc`).limit(3);
  const [eqm] = await db.select({ v: L.equipment, c: sql<number>`count(*)` }).from(L).where(where).groupBy(L.equipment).orderBy(sql`count(*) desc`).limit(1);
  const [fam] = await db.select({ v: L.family, c: sql<number>`count(*)` }).from(L).where(where).groupBy(L.family).orderBy(sql`count(*) desc`).limit(1);
  return {
    ok: true, loadsPerMonth: Math.round(n / months), accounts,
    lanes: lanes.map((l) => ({ dest: l.dest, pct: Math.round((Number(l.c) / n) * 100) })),
    equipment: eqm?.v ?? null, family: fam?.v ?? null,
  };
}
