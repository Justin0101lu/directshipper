import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { receivers, lookalikes } from "@/lib/freight/prospects";
import { visibleContacts } from "@/lib/enrich";
import { outboundFor } from "@/lib/freight/network";
import { laneMedian } from "@/lib/freight/profile";

/* Prospects = the loads, with both ends of every one, plus everything we
   know about each dock and the people there. */
export const GET = withSession(async (req, s) => {
  const u = new URL(req.url);
  const db = await getDb();
  const L = schema.loads, ST = schema.stops, F = schema.facilities;
  const loads = await db.select().from(L).where(eq(L.accountId, s.aid)).orderBy(desc(L.pickupAt)).limit(1500);
  const ids = loads.map((l) => l.id);
  const stops = ids.length ? await db.select().from(ST).where(inArray(ST.loadId, ids)).orderBy(ST.seq) : [];
  const facIds = [...new Set(stops.map((x) => x.facilityId).filter(Boolean) as string[])];
  const facs = facIds.length ? await db.select().from(F).where(inArray(F.id, facIds)) : [];
  const facMap = Object.fromEntries(facs.map((f) => [f.id, { id: f.id, name: f.name, city: f.city, state: f.state, type: f.type, shipper: f.shipper, discoveredAt: f.discoveredAt }]));
  const byLoad: Record<string, typeof stops> = {};
  for (const st of stops) (byLoad[st.loadId] ||= []).push(st);

  const recv = await receivers(s.aid);
  const look = await lookalikes(s.aid, { originState: u.searchParams.get("state") || undefined, equipment: u.searchParams.get("equipment") || undefined, family: u.searchParams.get("family") || undefined, minPerMonth: Number(u.searchParams.get("min") || 4) || 4 });
  const contacts = await visibleContacts(s.aid, [...new Set([...facIds, ...look.rows.map((r) => r.facilityId)])]);
  /* Every dock on the page gets counts and outbound, pickup-only docks included. */
  const docks: Record<string, unknown> = Object.fromEntries(recv.map((r) => [r.facilityId, r]));
  const tally: Record<string, { in: number; out: number }> = {};
  for (const st of stops) { if (!st.facilityId) continue; const t = (tally[st.facilityId] ||= { in: 0, out: 0 }); if (st.kind === "drop") t.in++; else t.out++; }
  for (const fid of facIds.slice(0, 80)) {
    if (docks[fid]) continue;
    const f = facMap[fid]; const ob = await outboundFor(fid, s.aid); const t = tally[fid] || { in: 0, out: 0 };
    docks[fid] = { facilityId: fid, name: f.name, city: `${f.city}, ${f.state}`, deliveries: t.in, pickups: t.out, outbound: ob,
      standing: ob.ok ? "clear" : "thin", why: t.out ? `You pick up here ${t.out} time${t.out === 1 ? "" : "s"}. ${ob.ok ? `Ships about ${ob.loadsPerMonth}/mo outbound.` : "Not enough unrelated carriers have seen this dock to say what else it ships."}` : "" };
  }

  return json({
    loads: loads.map((l) => {
      const st = byLoad[l.id] || [];
      const med = l.originCity && l.destCity ? laneMedian(loads, l.originCity, l.destCity) : null;
      return {
        id: l.id, date: l.pickupAt?.toISOString().slice(0, 10) ?? null, loadNumber: l.loadNumber, broker: l.broker, brokerMc: l.brokerMc, authorityId: l.authorityId, carrierName: l.carrierName,
        lane: `${l.originCity ?? "?"} ${l.originState ?? ""} → ${l.destCity ?? "?"} ${l.destState ?? ""}`, equipment: l.equipment, family: l.family,
        miles: l.miles, rate: l.rate, perMile: l.perMile, median: med, commodity: l.commodity,
        pickups: st.filter((x) => x.kind === "pickup").map((x) => ({ facilityId: x.facilityId, city: x.city, state: x.state })),
        drops: st.filter((x) => x.kind === "drop").map((x) => ({ facilityId: x.facilityId, city: x.city, state: x.state })),
      };
    }),
    facilities: facMap, docks, receivers: recv, lookalikes: look, contacts,
  });
});
