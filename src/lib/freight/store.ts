import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { RateCon, Stop } from "@/lib/ai/parse";
import { facilityKey, facilityType, normCity, normState } from "./facilities";

async function upsertFacility(f: Stop, shipper: string | null) {
  if (!f.city && !f.facility) return null;
  const db = await getDb();
  const key = facilityKey(f.street, f.city, f.state, f.facility);
  const [existing] = await db.select().from(schema.facilities).where(eq(schema.facilities.key, key));
  if (existing) {
    if (!existing.shipper && shipper) await db.update(schema.facilities).set({ shipper }).where(eq(schema.facilities.id, existing.id));
    return existing.id;
  }
  const name = f.facility || shipper || `${normCity(f.city)} dock`;
  const [row] = await db.insert(schema.facilities).values({
    key, name, street: f.street, city: normCity(f.city), state: normState(f.state), zip: f.zip,
    type: facilityType(name, shipper), shipper,
  }).returning();
  return row.id;
}

function family(rc: RateCon): string {
  if (rc.family === "refrigerated") return "frozen";  // one family for temp-controlled food that is not produce
  if (rc.family === "unknown") return rc.equipment === "reefer" ? "frozen" : "dry";
  return rc.family;
}

export async function storeLoad(accountId: string, mailboxId: string | null, sourceRef: string, rc: RateCon, receivedAt: Date) {
  const db = await getDb();
  const dup = await db.select({ id: schema.loads.id }).from(schema.loads).where(and(eq(schema.loads.accountId, accountId), eq(schema.loads.sourceRef, sourceRef))).limit(1);
  if (dup.length) return false;
  const stops: Stop[] = rc.stops?.length ? rc.stops : [rc.pickup, rc.delivery];
  const pickups = stops.filter((s) => s.kind === "pickup"), drops = stops.filter((s) => s.kind === "drop");
  const first = pickups[0] || rc.pickup, last = drops[drops.length - 1] || rc.delivery;
  const facIds: (string | null)[] = [];
  for (const s of stops) facIds.push(await upsertFacility(s, s.kind === "pickup" ? rc.shipper : null));
  const originId = facIds[stops.indexOf(first)] ?? null;
  const destId = facIds[stops.indexOf(last)] ?? null;
  const pickupAt = first.at ? new Date(first.at) : receivedAt;
  const perMile = rc.rate_total && rc.miles ? Math.round((rc.rate_total / rc.miles) * 100) / 100 : null;
  const [load] = await db.insert(schema.loads).values({
    accountId, mailboxId, sourceRef, loadNumber: rc.load_number,
    broker: rc.broker.name, brokerMc: rc.broker.mc, brokerEmail: rc.broker.email,
    shipper: rc.shipper, originId, destId,
    originCity: normCity(first.city), originState: normState(first.state),
    destCity: normCity(last.city), destState: normState(last.state),
    pickupAt: isNaN(pickupAt.getTime()) ? receivedAt : pickupAt,
    deliveryAt: last.at ? new Date(last.at) : null,
    commodity: rc.commodity, family: family(rc), equipment: rc.equipment === "unknown" ? null : rc.equipment,
    tempF: rc.temp_f, miles: rc.miles ? Math.round(rc.miles) : null, rate: rc.rate_total, perMile,
    confidence: rc.confidence, raw: rc,
  }).returning();
  await db.insert(schema.stops).values(stops.map((s, i) => ({
    loadId: load.id, accountId, seq: i, kind: s.kind, facilityId: facIds[i],
    city: normCity(s.city) || null, state: normState(s.state) || null,
    at: s.at && !isNaN(new Date(s.at).getTime()) ? new Date(s.at) : null,
  })));
  return true;
}
