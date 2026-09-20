import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fail, withSession } from "@/lib/api";
import { recentLoads } from "@/lib/freight/prospects";
import { PLANS, type PlanId } from "@/lib/plans";
export const GET = withSession(async (_req, s) => {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid));
  if (!PLANS[a.plan as PlanId].export) return fail("Export is on Carrier and Fleet.", 402);
  const rows = await recentLoads(s.aid, 100000);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["pickup", "load_number", "broker", "broker_mc", "shipper", "origin_city", "origin_state", "dest_city", "dest_state", "commodity", "family", "equipment", "miles", "rate", "per_mile"];
  const csv = [head.join(","), ...rows.map((r) => [r.pickupAt?.toISOString().slice(0, 10), r.loadNumber, r.broker, r.brokerMc, r.shipper, r.originCity, r.originState, r.destCity, r.destState, r.commodity, r.family, r.equipment, r.miles, r.rate, r.perMile].map(esc).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="loads.csv"` } });
});
