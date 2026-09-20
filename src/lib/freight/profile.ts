import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/* Everything about the carrier's own freight, computed from their loads.
   Free, always. */

export type Profile = {
  loads: number; from: string | null; to: string | null;
  families: { name: string; pct: number }[];
  equipment: { name: string; pct: number }[];
  avgMiles: number | null; avgPerMile: number | null; busiestMonth: string | null;
  lanes: { lane: string; loads: number; perMile: number | null; origin: string; dest: string }[];
  deadhead: { city: string; pct: number; deliveries: number }[];
  brokers: { name: string; loads: number; perMile: number | null; lastAt: string | null }[];
  home: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FAMILY_LABEL: Record<string, string> = { frozen: "Frozen & refrigerated food", produce: "Fresh produce", beverage: "Beverage", dry: "Dry freight", other: "Other" };
const EQ_LABEL: Record<string, string> = { reefer: "Reefer", dry_van: "Dry van", flatbed: "Flatbed", other: "Other" };

export async function computeProfile(accountId: string): Promise<Profile> {
  const db = await getDb();
  const rows = await db.select().from(schema.loads).where(eq(schema.loads.accountId, accountId)).orderBy(desc(schema.loads.pickupAt));
  const n = rows.length;
  const pct = (m: Map<string, number>, label: (k: string) => string) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: label(k), pct: Math.round((v / n) * 100) })).filter((x) => x.pct > 0);

  const fam = new Map<string, number>(), eqm = new Map<string, number>(), month = new Map<number, number>();
  const lanes = new Map<string, { loads: number; sum: number; cnt: number; origin: string; dest: string }>();
  const brokers = new Map<string, { loads: number; sum: number; cnt: number; last: Date | null }>();
  const origins = new Map<string, number>();
  let milesSum = 0, milesN = 0, pmSum = 0, pmN = 0;

  for (const l of rows) {
    fam.set(l.family || "other", (fam.get(l.family || "other") || 0) + 1);
    if (l.equipment) eqm.set(l.equipment, (eqm.get(l.equipment) || 0) + 1);
    if (l.pickupAt) month.set(l.pickupAt.getUTCMonth(), (month.get(l.pickupAt.getUTCMonth()) || 0) + 1);
    if (l.miles) { milesSum += l.miles; milesN++; }
    if (l.perMile) { pmSum += l.perMile; pmN++; }
    const o = `${l.originCity ?? "?"} ${l.originState ?? ""}`.trim(), d = `${l.destCity ?? "?"} ${l.destState ?? ""}`.trim();
    const k = `${o} → ${d}`;
    const L = lanes.get(k) || { loads: 0, sum: 0, cnt: 0, origin: o, dest: d };
    L.loads++; if (l.perMile) { L.sum += l.perMile; L.cnt++; } lanes.set(k, L);
    origins.set(o, (origins.get(o) || 0) + 1);
    if (l.broker) {
      const B = brokers.get(l.broker) || { loads: 0, sum: 0, cnt: 0, last: null };
      B.loads++; if (l.perMile) { B.sum += l.perMile; B.cnt++; }
      if (l.pickupAt && (!B.last || l.pickupAt > B.last)) B.last = l.pickupAt;
      brokers.set(l.broker, B);
    }
  }

  /* Deadhead: a delivery city with no pickup from that city within 48 hours after. */
  const byPickup = rows.filter((l) => l.pickupAt).map((l) => ({ t: l.pickupAt!.getTime(), city: `${l.originCity ?? ""} ${l.originState ?? ""}`.trim() }));
  const dh = new Map<string, { empty: number; total: number }>();
  for (const l of rows) {
    if (!l.deliveryAt && !l.pickupAt) continue;
    const dcity = `${l.destCity ?? ""} ${l.destState ?? ""}`.trim();
    if (!dcity) continue;
    const t = (l.deliveryAt || new Date(l.pickupAt!.getTime() + 24 * 3600e3)).getTime();
    const reloaded = byPickup.some((p) => p.city === dcity && p.t >= t && p.t <= t + 48 * 3600e3);
    const D = dh.get(dcity) || { empty: 0, total: 0 };
    D.total++; if (!reloaded) D.empty++; dh.set(dcity, D);
  }

  const busiest = [...month.entries()].sort((a, b) => b[1] - a[1])[0];
  const home = [...origins.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    loads: n,
    from: n ? rows[n - 1].pickupAt?.toISOString().slice(0, 10) ?? null : null,
    to: n ? rows[0].pickupAt?.toISOString().slice(0, 10) ?? null : null,
    families: pct(fam, (k) => FAMILY_LABEL[k] || k),
    equipment: pct(eqm, (k) => EQ_LABEL[k] || k),
    avgMiles: milesN ? Math.round(milesSum / milesN) : null,
    avgPerMile: pmN ? Math.round((pmSum / pmN) * 100) / 100 : null,
    busiestMonth: busiest ? MONTHS[busiest[0]] : null,
    lanes: [...lanes.entries()].filter(([, v]) => v.loads >= 3).map(([lane, v]) => ({ lane, loads: v.loads, perMile: v.cnt ? Math.round((v.sum / v.cnt) * 100) / 100 : null, origin: v.origin, dest: v.dest }))
      .sort((a, b) => (b.perMile ?? 0) - (a.perMile ?? 0)).slice(0, 8),
    deadhead: [...dh.entries()].filter(([, v]) => v.total >= 3).map(([city, v]) => ({ city, pct: Math.round((v.empty / v.total) * 100), deliveries: v.total }))
      .sort((a, b) => b.pct - a.pct).slice(0, 6),
    brokers: [...brokers.entries()].map(([name, v]) => ({ name, loads: v.loads, perMile: v.cnt ? Math.round((v.sum / v.cnt) * 100) / 100 : null, lastAt: v.last?.toISOString().slice(0, 10) ?? null }))
      .sort((a, b) => b.loads - a.loads),
    home,
  };
}

/* Median $/mi on a lane, for the "rate low" flag and the quote hint. */
export function laneMedian(rows: { originCity: string | null; destCity: string | null; perMile: number | null }[], originCity: string, destCity: string) {
  const v = rows.filter((r) => r.originCity === originCity && r.destCity === destCity && r.perMile).map((r) => r.perMile!).sort((a, b) => a - b);
  if (v.length < 3) return null;
  return v[Math.floor(v.length / 2)];
}
