import { eq, and, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { companyKeyOf } from "@/lib/enrich";
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
  const name = f.facility || shipper || `${normCity(f.city)} warehouse`;
  const [row] = await db.insert(schema.facilities).values({
    key, name, street: f.street, city: normCity(f.city), state: normState(f.state), zip: f.zip,
    type: facilityType(name, shipper), shipper, companyKey: companyKeyOf({ domain: null, shipper, name }),
  }).returning();
  return row.id;
}

/* Match the carrier party on the rate con to one of the account's authorities,
   by MC first, then by name; create it when new. */
const normName = (v: string) => v.toLowerCase().replace(/\b(llc|inc|corp|co|ltd|trucking|transport(ation)?|logistics|express|carriers?|lines?|freight)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
async function resolveAuthority(accountId: string, name: string | null, mc: string | null) {
  if (!name && !mc) return null;
  const db = await getDb();
  const rows = await db.select().from(schema.authorities).where(eq(schema.authorities.accountId, accountId));
  const mcDigits = mc ? mc.replace(/\D/g, "") : "";
  let hit = mcDigits ? rows.find((r) => r.mc === mcDigits) : undefined;
  if (!hit && name) hit = rows.find((r) => normName(r.name) === normName(name));
  if (hit) {
    if (!hit.mc && mcDigits) await db.update(schema.authorities).set({ mc: mcDigits }).where(eq(schema.authorities.id, hit.id));
    await db.update(schema.authorities).set({ loads: sql`${schema.authorities.loads} + 1` }).where(eq(schema.authorities.id, hit.id));
    return hit.id;
  }
  const [row] = await db.insert(schema.authorities).values({ accountId, name: name || `MC ${mcDigits}`, mc: mcDigits || null, loads: 1 }).returning();
  return row.id;
}

function family(rc: RateCon): string {
  if (rc.family === "refrigerated") return "frozen";  // one family for temp-controlled food that is not produce
  if (rc.family === "unknown") return rc.equipment === "reefer" ? "frozen" : "dry";
  return rc.family;
}

export async function storeLoad(accountId: string, mailboxId: string | null, sourceRef: string, rc: RateCon, receivedAt: Date, docHash?: string) {
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
  const authorityId = await resolveAuthority(accountId, rc.carrier?.name ?? null, rc.carrier?.mc ?? null);
  const pickupAt = first.at ? new Date(first.at) : receivedAt;
  const perMile = rc.rate_total && rc.miles ? Math.round((rc.rate_total / rc.miles) * 100) / 100 : null;
  const [load] = await db.insert(schema.loads).values({
    accountId, mailboxId, sourceRef, docHash: docHash ?? null, loadNumber: rc.load_number,
    broker: rc.broker.name, brokerMc: rc.broker.mc, brokerEmail: rc.broker.email,
    carrierName: rc.carrier?.name ?? null, carrierMc: rc.carrier?.mc ?? null, authorityId,
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
