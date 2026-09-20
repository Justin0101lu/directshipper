import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/* A hold is a broker's non-solicit reaching a warehouse the carrier was sent to
   by that broker. With no agreement on file the broad reading applies:
   24 months from the last load, consignees included, survives termination.
   An uploaded agreement replaces the assumption with what the clause says. */

export const DEFAULT_TERM_MONTHS = 24;

export type Hold = { broker: string; lastLoad: string; until: string; expired: boolean; source: "assumed" | "agreement"; coversConsignees: boolean; termMonths: number | null; clause?: string; agreementId?: string };
export type DockHold = { facilityId: string; clear: boolean; holds: Hold[]; reason: string };

function norm(s: string) { return s.toLowerCase().replace(/\b(llc|inc|corp|co|ltd|logistics|freight|transport(ation)?|services?|group|brokerage)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }

export async function dockHolds(accountId: string, facilityId: string): Promise<DockHold> {
  const db = await getDb();
  const ST = schema.stops, L = schema.loads;
  /* Which brokers put us at this warehouse, at which end, and when last. */
  const rows = await db.select({ broker: L.broker, kind: ST.kind, last: sql<Date>`max(coalesce(${ST.at}, ${L.pickupAt}))` })
    .from(ST).innerJoin(L, eq(ST.loadId, L.id)).where(and(eq(ST.accountId, accountId), eq(ST.facilityId, facilityId), sql`${L.broker} is not null`)).groupBy(L.broker, ST.kind);
  const agreements = await db.select().from(schema.agreements).where(eq(schema.agreements.accountId, accountId));
  const holds: Hold[] = [];
  const narrowed: string[] = [];   // brokers whose agreement names shippers only, on a warehouse we only deliver to
  const byBroker = new Map<string, { last: Date; kinds: Set<string> }>();
  for (const r of rows) { const k = r.broker!; const e = byBroker.get(k) || { last: new Date(0), kinds: new Set<string>() }; const d = new Date(r.last); if (d > e.last) e.last = d; e.kinds.add(r.kind); byBroker.set(k, e); }
  for (const [broker, e] of byBroker) {
    const ag = agreements.find((a) => norm(a.broker) === norm(broker) || (a.brokerMc && rows.length && false));
    const onlyDelivered = !e.kinds.has("pickup");
    if (ag) {
      /* Agreement on file: a clause that does not reach consignees does not hold a warehouse we only deliver to. */
      if (onlyDelivered && ag.coversConsignees === false && !ag.coversAllLocations) { narrowed.push(broker); continue; }
      const term = ag.termMonths ?? (ag.fromEvent === "unknown" ? DEFAULT_TERM_MONTHS : DEFAULT_TERM_MONTHS);
      const until = new Date(e.last); until.setMonth(until.getMonth() + term);
      holds.push({ broker, lastLoad: e.last.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), expired: until < new Date(), source: "agreement", coversConsignees: !!ag.coversConsignees, termMonths: ag.termMonths, clause: ag.clause, agreementId: ag.id });
    } else {
      const until = new Date(e.last); until.setMonth(until.getMonth() + DEFAULT_TERM_MONTHS);
      holds.push({ broker, lastLoad: e.last.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), expired: until < new Date(), source: "assumed", coversConsignees: true, termMonths: null });
    }
  }
  const live = holds.filter((h) => !h.expired);
  const clear = live.length === 0;
  const reason = clear
    ? holds.length && narrowed.length ? `No hold on file: ${narrowed.length} agreement${narrowed.length === 1 ? "" : "s"} name shippers only, and ${holds.length} term${holds.length === 1 ? "" : "s"} ran out.`
    : narrowed.length ? `No hold on file: ${narrowed.length === 1 ? `${narrowed[0]}'s agreement names` : `${narrowed.length} brokers' agreements name`} shippers only, and you only deliver here.`
    : holds.length ? `No hold on file. ${holds.length} broker term${holds.length === 1 ? "" : "s"} ran out, last on ${holds.map((h) => h.until).sort().pop()}.` : "No broker put you at this warehouse."
    : `On hold until ${live.map((h) => h.until).sort().pop()} under ${live.map((h) => h.broker).join(", ")}${live.some((h) => h.source === "assumed") ? " (assumed 24 months, consignees included; upload the agreement to narrow it)" : ""}.`;
  return { facilityId, clear, holds: holds.sort((a, b) => b.until.localeCompare(a.until)), reason };
}
