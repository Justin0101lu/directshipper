import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { recentLoads } from "@/lib/freight/prospects";
import { laneMedian } from "@/lib/freight/profile";
export const GET = withSession(async (_req, s) => {
  const rows = await recentLoads(s.aid, 2000);
  const db = await getDb();
  const facs = new Map<string, string>();
  for (const id of new Set(rows.flatMap((r) => [r.originId, r.destId]).filter(Boolean) as string[])) {
    const [f] = await db.select({ name: schema.facilities.name }).from(schema.facilities).where(eq(schema.facilities.id, id));
    if (f) facs.set(id, f.name);
  }
  return json(rows.map((r) => {
    const med = r.originCity && r.destCity ? laneMedian(rows, r.originCity, r.destCity) : null;
    return {
      id: r.id, date: r.pickupAt?.toISOString().slice(0, 10) ?? null, loadNumber: r.loadNumber, broker: r.broker, brokerMc: r.brokerMc, shipper: r.shipper, authorityId: r.authorityId, carrierName: r.carrierName,
      facility: r.originId ? facs.get(r.originId) : null, dest: r.destId ? facs.get(r.destId) : null,
      lane: `${r.originCity ?? "?"} ${r.originState ?? ""} → ${r.destCity ?? "?"} ${r.destState ?? ""}`, equipment: r.equipment, family: r.family,
      miles: r.miles, rate: r.rate, perMile: r.perMile, direct: r.direct, confidence: r.confidence,
      status: r.direct ? "direct" : (med && r.perMile && r.perMile < med * 0.9) ? "flag" : (r.shipper || r.originId) ? "ok" : "unres",
      median: med,
    };
  }));
});
