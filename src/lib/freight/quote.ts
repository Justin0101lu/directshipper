import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { stateAbbr } from "./states";

/* A rate the carrier can stand behind: what their own rate cons say they were paid
   on that lane. City pair first, state pair as a fallback, never invented. */
export type Quote = { line: string; basis: string; perMile: number; total: number | null; miles: number | null; loads: number; level: "lane" | "states" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString();

export async function quoteFor(accountId: string, lane: { origin: string; dest: string }): Promise<Quote | null> {
  const db = await getDb();
  const L = schema.loads;
  const rows = await db.select({ oc: L.originCity, os: L.originState, dc: L.destCity, ds: L.destState, miles: L.miles, perMile: L.perMile, rate: L.rate, at: L.pickupAt })
    .from(L).where(and(eq(L.accountId, accountId), sql`${L.perMile} is not null`)).orderBy(desc(L.pickupAt)).limit(3000);
  const split = (s: string) => { const m = s.match(/^\s*([^,]+?)\s*,?\s*([A-Za-z]{2}|[A-Za-z ]{4,})?\s*$/); const city = m ? norm(m[1]) : norm(s); const st = m?.[2] ? stateAbbr(m[2]) : null; return { city, st }; };
  const o = split(lane.origin), d = split(lane.dest);
  const cityHit = rows.filter((r) => r.oc && r.dc && norm(r.oc) === o.city && norm(r.dc) === d.city && (!o.st || r.os === o.st) && (!d.st || r.ds === d.st));
  const pick = (set: typeof rows, level: Quote["level"]): Quote | null => {
    if (set.length < 3) return null;
    const pm = median(set.map((r) => r.perMile!))!;
    const mi = median(set.map((r) => r.miles!).filter(Boolean));
    const last = set[0].at ? new Date(set[0].at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null;
    const total = mi ? pm * mi : null;
    const where = level === "lane" ? `${lane.origin} to ${lane.dest}` : `${set[0].os} to ${set[0].ds} (state to state; no loads on that exact city pair)`;
    const basis = `From your own rate cons: ${set.length} loads ${where}, median $${pm.toFixed(2)}/mi${mi ? ` at about ${mi} miles` : ""}${last ? `, last on ${last}` : ""}.`;
    const line = total ? `${fmtMoney(total)} all-in (${pm.toFixed(2)}/mi, about ${mi} miles)` : `$${pm.toFixed(2)} a mile`;
    return { line, basis, perMile: pm, total, miles: mi, loads: set.length, level };
  };
  const byLane = pick(cityHit, "lane");
  if (byLane) return byLane;
  const oS = o.st || (cityHit[0]?.os ?? null), dS = d.st || (cityHit[0]?.ds ?? null);
  if (!oS || !dS) {
    /* try to learn the states from any load that touches those cities */
    const oGuess = rows.find((r) => r.oc && norm(r.oc) === o.city)?.os || null, dGuess = rows.find((r) => r.dc && norm(r.dc) === d.city)?.ds || null;
    if (!oGuess || !dGuess) return null;
    return pick(rows.filter((r) => r.os === oGuess && r.ds === dGuess), "states");
  }
  return pick(rows.filter((r) => r.os === oS && r.ds === dS), "states");
}
