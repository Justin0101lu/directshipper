/* Seeds a demo carrier plus a few "network" carriers so receivers and
   lookalikes have observations to draw on. Run: npm run demo
   Sign in: demo@directshipper.co / demo1234 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { storeLoad } from "../src/lib/freight/store";
import type { RateCon } from "../src/lib/ai/parse";

let seed = 20210104;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const PICKUPS = [
  { facility: "Lineage Ontario 4", street: "4200 E Airport Dr", city: "Ontario", state: "CA", zip: "91761", shipper: "Sunrise Frozen Foods", family: "frozen" as const, w: 52 },
  { facility: "Del Rio Produce DC", street: "900 W Rincon St", city: "Corona", state: "CA", zip: "92880", shipper: "Del Rio Produce Co", family: "produce" as const, w: 31 },
  { facility: "Americold Ontario", street: "1801 S Milliken Ave", city: "Ontario", state: "CA", zip: "91761", shipper: null, family: "frozen" as const, w: 17 },
];
const DESTS = [
  { facility: "SW Distribution Center", street: "2300 W Broadway Rd", city: "Phoenix", state: "AZ", miles: 389 },
  { facility: "Valley Retail RDC", street: "6200 S Valley View Blvd", city: "Las Vegas", state: "NV", miles: 230 },
  { facility: "Lone Star Grocery DC", street: "1500 N Stemmons Fwy", city: "Dallas", state: "TX", miles: 1440 },
  { facility: "Summit Beverage Whse", street: "4800 Brighton Blvd", city: "Denver", state: "CO", miles: 1020 },
  { facility: "Cactus Cold Storage", street: "8900 W Buckeye Rd", city: "Tolleson", state: "AZ", miles: 380 },
  { facility: "Desert Valley Foods DC", street: "5100 W Glendale Ave", city: "Glendale", state: "AZ", miles: 395 },
  { facility: "Wasatch Cold", street: "1200 S 5600 W", city: "Salt Lake City", state: "UT", miles: 710 },
];
const HOME_DOCKS = [
  { facility: "Inland Empire Cold", street: "3000 E Guasti Rd", city: "Ontario", state: "CA", miles: 390 },
  { facility: "Corona Produce Terminal", street: "1200 Magnolia Ave", city: "Corona", state: "CA", miles: 395 },
];
const BROKERS = [["Midland Logistics LLC", "884213"], ["Coast Range Freight", "712880"], ["Vantage Transport Svcs", "1099421"], ["Apex Freight Group", "1288740"], ["Sierra Lane Brokerage", "940112"], ["Harbor Point Logistics", "1014557"], ["Trident Transport Mgmt", "867340"], ["Cross Basin Carriers", "1322908"]];

function rc(p: typeof PICKUPS[number], d: typeof DESTS[number], br: string[], t: Date, perMi: number, reefer: boolean): RateCon {
  return {
    is_rate_confirmation: true, load_number: String(4400000 + Math.floor(rnd() * 90000)),
    broker: { name: br[0], mc: br[1], email: `dispatch@${br[0].toLowerCase().replace(/[^a-z]/g, "")}.com` },
    shipper: p.shipper,
    stops: [], pickup: { kind: "pickup", facility: p.facility, street: p.street, city: p.city, state: p.state, zip: p.zip, at: t.toISOString() },
    delivery: { kind: "drop", facility: d.facility, street: d.street, city: d.city, state: d.state, zip: null, at: new Date(t.getTime() + (d.miles / 500 + 0.5) * 86400e3).toISOString() },
    commodity: p.family === "produce" ? "Fresh produce" : "Frozen food", family: p.family, equipment: reefer ? "reefer" : "dry_van", temp_f: reefer ? (p.family === "produce" ? 34 : -10) : null,
    miles: d.miles, rate_total: Math.round((d.miles * perMi) / 10) * 10, confidence: 0.93,
  };
}

async function main() {
  const db = await getDb();
  const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, "demo@directshipper.co"));
  if (exists) { console.log("demo account already exists"); process.exit(0); }
  const [acct] = await db.insert(schema.accounts).values({ company: "Ruiz Trucking LLC", mc: "884213", plan: "carrier", tokensMonthly: 100 }).returning();
  await db.insert(schema.users).values({ accountId: acct.id, email: "demo@directshipper.co", name: "Justin Ruiz", passwordHash: await bcrypt.hash("demo1234", 10) });
  await db.insert(schema.ledger).values({ accountId: acct.id, delta: 100, what: "Carrier plan — first month" });
  const [mb] = await db.insert(schema.mailboxes).values({ accountId: acct.id, kind: "upload", address: "demo" }).returning();

  const bag: number[] = []; PICKUPS.forEach((p, i) => { for (let n = 0; n < p.w; n++) bag.push(i); });
  const start = Date.UTC(2024, 0, 4), end = Date.now();
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const p = PICKUPS[pick(bag)]; const d = DESTS[Math.floor(Math.pow(rnd(), 1.7) * DESTS.length)]; const br = BROKERS[Math.floor(Math.pow(rnd(), 1.4) * BROKERS.length)];
    const t = new Date(start + rnd() * (end - start));
    /* Phoenix rates drift down in 2026 for a couple of brokers, so the ask examples have something to find. */
    let perMi = 1.6 + rnd() * 1.5;
    if (d.city === "Phoenix" && t.getUTCFullYear() >= 2026 && (br[0].startsWith("Apex") || br[0].startsWith("Harbor"))) perMi -= 0.5;
    if (await storeLoad(acct.id, mb.id, `demo:${i}`, rc(p, d, br, t, perMi, rnd() > 0.06), t)) n++;
    /* Backhauls: a return load picked up in the delivery city within 48 hours, so deadhead varies by city. */
    const backP: Record<string, number> = { Phoenix: 0.75, "Las Vegas": 0.85, Tolleson: 0.7, Glendale: 0.6, Dallas: 0.5, Denver: 0.25, "Salt Lake City": 0.35 };
    if (rnd() < (backP[d.city] ?? 0.3)) {
      const home = pick(HOME_DOCKS);
      const t2 = new Date(t.getTime() + (d.miles / 500 + 0.5) * 86400e3 + rnd() * 40 * 3600e3);
      const back = rc({ facility: `${d.city} Cold Dock`, street: `${100 + Math.floor(rnd() * 900)} Industrial Way`, city: d.city, state: d.state, zip: "", shipper: null, family: "frozen", w: 1 }, home, br, t2, 1.8 + rnd() * 1.2, true);
      back.shipper = null;
      if (await storeLoad(acct.id, mb.id, `demo:${i}:back`, back, t2)) n++;
    }
  }
  console.log(`demo carrier: ${n} loads`);

  /* Agreements on file for six of the eight brokers, shippers-only clauses, so the
     demo's receivers clear. Two brokers have none, so the broad assumption holds
     any dock they alone put us at. */
  for (const [b, mc] of BROKERS) {
    const broad = false;   // every demo clause names shippers only; pickup docks stay held, receivers clear
    await db.insert(schema.agreements).values({
      accountId: acct.id, broker: b, brokerMc: mc, termMonths: broad ? 18 : 12, fromEvent: "last_shipment", survives: true, coversConsignees: broad, coversAllLocations: false,
      damages: "15% of gross revenue on solicited freight", page: "page 3, section 8", filename: `${b.replace(/\s+/g, "-")}-agreement.pdf`,
      clause: `Carrier shall not, for twelve (12) months following the last shipment tendered hereunder, solicit or accept freight from any shipper customer of Broker that was first introduced to Carrier by Broker. This obligation survives termination.`,
    });
  }

  /* Network carriers: their loads originate at the demo carrier's receivers, so outbound observations exist. */
  const ORIGINS = DESTS.filter((d) => d.city !== "Las Vegas");
  const NET_DESTS = [{ facility: "Ontario Cold Dock", street: "3000 E Guasti Rd", city: "Ontario", state: "CA", miles: 390 }, { facility: "Corona Produce Terminal", street: "1200 Magnolia Ave", city: "Corona", state: "CA", miles: 395 }, { facility: "LA Cold Storage", street: "3300 E Vernon Ave", city: "Vernon", state: "CA", miles: 420 }, { facility: "Tucson Foods DC", street: "4400 E Valencia Rd", city: "Tucson", state: "AZ", miles: 115 }, { facility: "Houston Grocers", street: "5900 Clinton Dr", city: "Houston", state: "TX", miles: 240 }];
  const LOOKALIKES = [{ facility: "Valley Cold Pack", street: "14800 Slover Ave", city: "Fontana", state: "CA", shipper: "Valley Cold Pack" }, { facility: "Harborline Foods", street: "2500 E 37th St", city: "Vernon", state: "CA", shipper: "Harborline Foods" }, { facility: "Sierra Dairy Group", street: "13200 Central Ave", city: "Chino", state: "CA", shipper: "Sierra Dairy Group" }, { facility: "Pacific Meat Co", street: "4000 Bandini Blvd", city: "Vernon", state: "CA", shipper: "Pacific Meat Co" }, { facility: "Redlands Citrus Co", street: "1600 W Redlands Blvd", city: "Redlands", state: "CA", shipper: "Redlands Citrus Co" }];
  for (let c = 0; c < 6; c++) {
    const [na] = await db.insert(schema.accounts).values({ company: `Network carrier ${c + 1}` }).returning();
    for (let i = 0; i < 220; i++) {
      const useLook = rnd() < 0.55;
      const o = useLook ? pick(LOOKALIKES) : pick(ORIGINS);
      const d = pick(NET_DESTS); const br = pick(BROKERS.slice(0, 3).concat(c % 2 ? [["Blue Mesa Logistics", "1400200"]] : []));
      const t = new Date(Date.UTC(2025, 0, 1) + rnd() * (end - Date.UTC(2025, 0, 1)));
      const r = rc({ facility: o.facility, street: o.street, city: o.city, state: o.state, zip: "", shipper: "shipper" in o ? o.shipper : null, family: "frozen", w: 1 }, d, br, t, 2.2 + rnd(), true);
      if ("shipper" in o) { r.shipper = o.shipper; r.broker.name = pick([["Blue Mesa Logistics"], ["Northwind Freight"], ["Keystone Cargo"]])[0]; }
      await storeLoad(na.id, null, `net:${c}:${i}`, r, t);
    }
  }
  console.log("network carriers seeded");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
