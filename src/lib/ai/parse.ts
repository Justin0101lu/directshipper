import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, MODEL } from "./client";

/* The rate con reader. One document in, one structured load out.
   Runs on PDFs (base64) and on plain text (email bodies, OCR'd scans). */

/* The API allows at most 16 optional (nullable/union) fields per schema, so
   every text field is required and "" means "not on the page". Only the
   three numbers stay nullable. toRateCon() turns "" back into null. */
const S = z.string().describe('the value as written, or "" if not on the page');
const Place = z.object({
  kind: z.enum(["pickup", "drop"]),
  facility: S, street: S, city: S,
  state: z.string().describe('two-letter US state or CA province, or ""'),
  zip: S,
  at: z.string().describe('ISO 8601 date or datetime, or ""'),
});
const WireSchema = z.object({
  is_rate_confirmation: z.boolean().describe("true only if this document is a carrier rate confirmation / load tender for a truckload shipment"),
  load_number: S,
  broker_name: S,
  broker_mc: z.string().describe('MC number digits only, no prefix, or ""'),
  broker_email: S,
  shipper: z.string().describe('the company that owns the freight, if it can be told apart from the pickup facility; else ""'),
  stops: z.array(Place).describe("every stop in order: all pickups and all drops, including multi-stop tenders"),
  commodity: S,
  family: z.enum(["frozen", "refrigerated", "produce", "beverage", "dry", "other", "unknown"]),
  equipment: z.enum(["reefer", "dry_van", "flatbed", "other", "unknown"]),
  temp_f: z.number().nullable(),
  miles: z.number().nullable(),
  rate_total: z.number().nullable().describe("total linehaul to the carrier in USD, including fuel if stated as all-in"),
  confidence: z.number().min(0).max(1),
});
type Wire = z.infer<typeof WireSchema>;

export type Stop = { kind: "pickup" | "drop"; facility: string | null; street: string | null; city: string | null; state: string | null; zip: string | null; at: string | null };
export type RateCon = {
  is_rate_confirmation: boolean;
  load_number: string | null;
  broker: { name: string | null; mc: string | null; email: string | null };
  shipper: string | null;
  stops: Stop[];
  pickup: Stop;      // first pickup
  delivery: Stop;    // last drop
  commodity: string | null;
  family: Wire["family"];
  equipment: Wire["equipment"];
  temp_f: number | null;
  miles: number | null;
  rate_total: number | null;
  confidence: number;
};
const n = (v: string) => (v && v.trim() ? v.trim() : null);
const place = (p: Wire["stops"][number]): Stop => ({ kind: p.kind, facility: n(p.facility), street: n(p.street), city: n(p.city), state: n(p.state), zip: n(p.zip), at: n(p.at) });
const EMPTY = (kind: Stop["kind"]): Stop => ({ kind, facility: null, street: null, city: null, state: null, zip: null, at: null });
export function toRateCon(w: Wire): RateCon {
  const stops = w.stops.map(place);
  const pickups = stops.filter((s) => s.kind === "pickup"), drops = stops.filter((s) => s.kind === "drop");
  return {
    is_rate_confirmation: w.is_rate_confirmation, load_number: n(w.load_number),
    broker: { name: n(w.broker_name), mc: n(w.broker_mc), email: n(w.broker_email) },
    shipper: n(w.shipper), stops, pickup: pickups[0] || EMPTY("pickup"), delivery: drops[drops.length - 1] || EMPTY("drop"),
    commodity: n(w.commodity), family: w.family, equipment: w.equipment,
    temp_f: w.temp_f, miles: w.miles, rate_total: w.rate_total, confidence: w.confidence,
  };
}

const SYSTEM = `You read trucking paperwork for a small carrier. Given one document, extract the fields of the rate confirmation exactly as written. Rules:
- Broker is the party paying the carrier (the tendering company on the confirmation), never the carrier.
- Stops: list every stop in order, pickups and drops both. A tender with two pickups and one drop has three stops. Never merge or skip a stop.
- Shipper is the company that owns the freight when the paperwork names one distinct from the pickup facility (for example a 3PL cold storage pickup with a "Customer" or "Account" line). Otherwise "".
- Family: frozen (temp at or below 0F or the word frozen), refrigerated (33-45F, chilled, cold), produce (fresh fruit/vegetables, even if refrigerated), beverage, dry, other. Unknown if not stated.
- Equipment: reefer for any refrigerated trailer; dry_van for van; flatbed; other; unknown.
- Miles: as stated; do not estimate.
- Rate total: the carrier's linehaul total. If separate fuel surcharge is stated, add it. Ignore accessorials.
- Set is_rate_confirmation false for anything that is not a rate con or load tender (invoices, BOLs, newsletters).
- Never invent a value. Use "" for a text field and null for a number when it is not on the page.`;

export async function parseRateCon(input: { pdfBase64?: string; text?: string; filename?: string }): Promise<RateCon> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.pdfBase64) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 } });
  }
  if (input.text) content.push({ type: "text", text: `Document text${input.filename ? ` (${input.filename})` : ""}:\n\n${input.text.slice(0, 60_000)}` });
  content.push({ type: "text", text: "Extract the rate confirmation." });

  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(WireSchema), effort: "medium" },
    messages: [{ role: "user", content }],
  });
  if (!res.parsed_output) throw new Error("The reader could not make sense of that document.");
  return toRateCon(res.parsed_output);
}
