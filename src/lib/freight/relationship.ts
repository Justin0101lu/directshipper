import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/* Everything the carrier's own paperwork says about one warehouse. Free, exact,
   and the raw material for a personal opener. */
export type Relationship = {
  facilityId: string; name: string; city: string; state: string;
  deliveries: number; pickups: number; loads: number;
  firstAt: string | null; lastAt: string | null; daysSinceLast: number | null; perMonth: number;
  weekday: string | null;                 // the day we most often show up
  lanesIn: { from: string; n: number }[]; // where we come from when we deliver here
  lanesOut: { to: string; n: number }[];  // where we go when we pick up here
  family: string | null; equipment: string | null;
  brokers: number; brokerNames: string[];
  kind: "receiver" | "shipper" | "both";
  warmth: number;                          // ranking score
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function relationship(accountId: string, facilityId: string): Promise<Relationship | null> {
  const db = await getDb();
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId));
  if (!f) return null;
  const ST = schema.stops, L = schema.loads;
  const rows = await db.select({ kind: ST.kind, at: ST.at, loadId: ST.loadId, broker: L.broker, family: L.family, equipment: L.equipment, oc: L.originCity, os: L.originState, dc: L.destCity, ds: L.destState, pickupAt: L.pickupAt })
    .from(ST).innerJoin(L, eq(ST.loadId, L.id)).where(and(eq(ST.accountId, accountId), eq(ST.facilityId, facilityId)));
  if (!rows.length) return null;
  const seen = new Set<string>(); const uniq = rows.filter((r) => { if (seen.has(r.loadId + r.kind)) return false; seen.add(r.loadId + r.kind); return true; });
  const deliveries = uniq.filter((r) => r.kind === "drop").length, pickups = uniq.filter((r) => r.kind === "pickup").length;
  const dates = uniq.map((r) => r.at || r.pickupAt).filter(Boolean) as Date[];
  dates.sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0] || null, last = dates[dates.length - 1] || null;
  const months = first && last ? Math.max(1, (last.getTime() - first.getTime()) / (30 * 86400e3)) : 1;
  const count = (arr: string[]) => { const m = new Map<string, number>(); arr.forEach((k) => m.set(k, (m.get(k) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const wd = count(dates.map((d) => DAYS[d.getUTCDay()]))[0];
  const lanesIn = count(uniq.filter((r) => r.kind === "drop" && r.oc).map((r) => `${r.oc} ${r.os ?? ""}`.trim())).slice(0, 3).map(([from, n]) => ({ from, n }));
  const lanesOut = count(uniq.filter((r) => r.kind === "pickup" && r.dc).map((r) => `${r.dc} ${r.ds ?? ""}`.trim())).slice(0, 3).map(([to, n]) => ({ to, n }));
  const family = count(uniq.map((r) => r.family || "").filter(Boolean))[0]?.[0] ?? null;
  const equipment = count(uniq.map((r) => r.equipment || "").filter(Boolean))[0]?.[0] ?? null;
  const brokerNames = count(uniq.map((r) => r.broker || "").filter(Boolean)).map(([b]) => b);
  const daysSinceLast = last ? Math.round((Date.now() - last.getTime()) / 86400e3) : null;
  /* Warmth: volume, recency, and a receiver relationship count most. */
  const warmth = Math.round((deliveries * 3 + pickups) * (daysSinceLast != null && daysSinceLast < 60 ? 1.5 : daysSinceLast != null && daysSinceLast < 180 ? 1.2 : 1) + (wd && wd[1] >= 3 ? 5 : 0));
  return {
    facilityId, name: f.name, city: f.city, state: f.state,
    deliveries, pickups, loads: deliveries + pickups,
    firstAt: first?.toISOString().slice(0, 10) ?? null, lastAt: last?.toISOString().slice(0, 10) ?? null, daysSinceLast,
    perMonth: Math.round(((deliveries + pickups) / months) * 10) / 10,
    weekday: wd && wd[1] >= 3 && wd[1] / dates.length >= 0.3 ? wd[0] : null,
    lanesIn, lanesOut, family, equipment, brokers: brokerNames.length, brokerNames: brokerNames.slice(0, 4),
    kind: deliveries && pickups ? "both" : deliveries ? "receiver" : "shipper", warmth,
  };
}

/* Plain-English version, used by the drafter and shown on the card. */
export function relationshipLine(r: Relationship) {
  const parts: string[] = [];
  if (r.deliveries) parts.push(`You have delivered here ${r.deliveries} time${r.deliveries === 1 ? "" : "s"}${r.firstAt ? ` since ${fmt(r.firstAt)}` : ""}`);
  if (r.pickups) parts.push(`${r.deliveries ? "and picked up" : "You have picked up"} here ${r.pickups} time${r.pickups === 1 ? "" : "s"}`);
  if (r.lastAt) parts.push(`last on ${fmt(r.lastAt)}`);
  if (r.weekday) parts.push(`usually on a ${r.weekday}`);
  if (r.lanesIn[0]) parts.push(`mostly in from ${r.lanesIn.map((l) => l.from).join(" and ")}`);
  if (r.brokers > 1) parts.push(`through ${r.brokers} different brokers`);
  return parts.join(", ") + ".";
}
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
