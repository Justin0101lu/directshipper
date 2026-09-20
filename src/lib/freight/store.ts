import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { RateCon } from "@/lib/ai/parse";
import { facilityKey, facilityType, normCity, normState } from "./facilities";

async function upsertFacility(f: RateCon["pickup"], shipper: string | null) {
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
  const originId = await upsertFacility(rc.pickup, rc.shipper);
  const destId = await upsertFacility(rc.delivery, null);
  const pickupAt = rc.pickup.at ? new Date(rc.pickup.at) : receivedAt;
  const perMile = rc.rate_total && rc.miles ? Math.round((rc.rate_total / rc.miles) * 100) / 100 : null;
  await db.insert(schema.loads).values({
    accountId, mailboxId, sourceRef, loadNumber: rc.load_number,
    broker: rc.broker.name, brokerMc: rc.broker.mc, brokerEmail: rc.broker.email,
    shipper: rc.shipper, originId, destId,
    originCity: normCity(rc.pickup.city), originState: normState(rc.pickup.state),
    destCity: normCity(rc.delivery.city), destState: normState(rc.delivery.state),
    pickupAt: isNaN(pickupAt.getTime()) ? receivedAt : pickupAt,
    deliveryAt: rc.delivery.at ? new Date(rc.delivery.at) : null,
    commodity: rc.commodity, family: family(rc), equipment: rc.equipment === "unknown" ? null : rc.equipment,
    tempF: rc.temp_f, miles: rc.miles ? Math.round(rc.miles) : null, rate: rc.rate_total, perMile,
    confidence: rc.confidence, raw: rc,
  });
  return true;
}
