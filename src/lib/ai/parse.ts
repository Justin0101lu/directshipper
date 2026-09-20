import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, PARSE_MODEL } from "./client";

/* The rate con reader. One document in, one structured load out.
   Runs on PDFs (base64) and on plain text (email bodies, OCR'd scans). */

/* Wire schema is deliberately terse: output tokens cost five times input,
   so short keys and no descriptions we can put in the system prompt instead.
   At most 16 optional fields per schema (API limit); only three numbers are
   nullable, "" means "not on the page". */
const S = z.string();
const StopW = z.object({ k: z.enum(["p", "d"]), f: S, a: S, c: S, s: S, z: S, t: S });
const WireSchema = z.object({
  ok: z.boolean(),
  ld: S, bn: S, bm: S, cn: S, cc: S, sh: S,
  st: z.array(StopW),
  cm: S,
  fa: z.enum(["frozen", "refrigerated", "produce", "beverage", "dry", "other", "unknown"]),
  eq: z.enum(["reefer", "dry_van", "flatbed", "other", "unknown"]),
  tf: z.number().nullable(), mi: z.number().nullable(), rt: z.number().nullable(),
});
type Wire = z.infer<typeof WireSchema>;

export type Stop = { kind: "pickup" | "drop"; facility: string | null; street: string | null; city: string | null; state: string | null; zip: string | null; at: string | null };
export type RateCon = {
  is_rate_confirmation: boolean;
  load_number: string | null;
  broker: { name: string | null; mc: string | null; email: string | null };
  carrier: { name: string | null; mc: string | null };   // the carrier the load was tendered to (one of the account's authorities)
  shipper: string | null;
  stops: Stop[];
  pickup: Stop;      // first pickup
  delivery: Stop;    // last drop
  commodity: string | null;
  family: Wire["fa"];
  equipment: Wire["eq"];
  temp_f: number | null;
  miles: number | null;
  rate_total: number | null;
  confidence: number;
};
const n = (v: string) => (v && v.trim() ? v.trim() : null);
const digits = (v: string) => { const d = (v || "").replace(/\D/g, ""); return d || null; };   // "MC 884213" -> "884213"
const place = (p: Wire["st"][number]): Stop => ({ kind: p.k === "p" ? "pickup" : "drop", facility: n(p.f), street: n(p.a), city: n(p.c), state: n(p.s), zip: n(p.z), at: n(p.t) });
const EMPTY = (kind: Stop["kind"]): Stop => ({ kind, facility: null, street: null, city: null, state: null, zip: null, at: null });
export function toRateCon(w: Wire): RateCon {
  const stops = w.st.map(place);
  const pickups = stops.filter((s) => s.kind === "pickup"), drops = stops.filter((s) => s.kind === "drop");
  return {
    is_rate_confirmation: w.ok, load_number: n(w.ld),
    broker: { name: n(w.bn), mc: digits(w.bm), email: null },
    carrier: { name: n(w.cn), mc: digits(w.cc) },
    shipper: n(w.sh), stops, pickup: pickups[0] || EMPTY("pickup"), delivery: drops[drops.length - 1] || EMPTY("drop"),
    commodity: n(w.cm), family: w.fa, equipment: w.eq,
    temp_f: w.tf, miles: w.mi, rate_total: w.rt, confidence: 0.9,
  };
}
export function parseWireJson(text: string): RateCon {
  return toRateCon(WireSchema.parse(JSON.parse(text)));
}

const SYSTEM = `You read trucking paperwork for a small carrier. Given one document, return the rate confirmation's fields as JSON with these keys:
ok: true only if this is a carrier rate confirmation / load tender for a truckload shipment (not an invoice, BOL alone, newsletter).
ld: load or reference number. bn: broker name, the party paying the carrier (never the carrier). bm: broker MC digits only. cn: the carrier the load is tendered to, as written (the trucking company, never the broker). cc: that carrier's MC digits only.
sh: the company that owns the freight if named apart from the pickup facility (a "Customer" or "Account" line at a 3PL), else "".
st: every stop in order. k: "p" pickup or "d" drop. f facility name, a street, c city, s two-letter state, z zip, t ISO date/datetime. A tender with two pickups and one drop has three stops; never merge or skip one.
cm: commodity as written. fa: frozen (<=0F or the word frozen) | refrigerated (33-45F, chilled) | produce (fresh fruit/veg) | beverage | dry | other | unknown.
eq: reefer | dry_van | flatbed | other | unknown. tf: temperature F. mi: miles as stated, never estimated. rt: total linehaul to the carrier in USD including fuel; ignore accessorials.
Never invent a value. "" for an unknown text field, null for an unknown number.`;

/* Text first. A PDF sent as a document costs ~2,000 tokens a page in images;
   its extracted text costs a few hundred. Only a scanned PDF with no text
   layer goes to the model as a document. */
async function pdfText(b64: string): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(b64, "base64") });
    const r = await parser.getText();
    await parser.destroy?.();
    return (r.text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } catch { return ""; }
}

/* Legal boilerplate is half of most rate cons and holds no field we want.
   Cut at the first terms heading past the top of the page, cap the rest. */
const TERMS = /terms\s*(and|&)\s*conditions|carrier\s+(agrees|shall|acknowledges|must)|indemnif|hold\s+harmless|by\s+(signing|accepting)|accessorial\s+(terms|policy|schedule)|detention\s+(policy|terms)|payment\s+terms|general\s+(terms|provisions)/i;
export function trimDoc(text: string, cap = 7000) {
  const m = TERMS.exec(text);
  const cut = m && m.index > 700 ? text.slice(0, m.index) : text;
  return cut.slice(0, cap);
}

/* Build the request once; used live and inside a half-price batch. */
export async function buildParseRequest(input: { pdfBase64?: string; text?: string; filename?: string }) {
  const content: Anthropic.ContentBlockParam[] = [];
  let pdfAsText = "";
  if (input.pdfBase64) pdfAsText = await pdfText(input.pdfBase64);
  if (input.pdfBase64 && pdfAsText.length < 200) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 } });
  }
  const text = [pdfAsText ? `PDF${input.filename ? ` (${input.filename})` : ""}:\n${trimDoc(pdfAsText)}` : "", input.text ? `Email:\n${trimDoc(input.text, pdfAsText ? 800 : 5000)}` : ""].filter(Boolean).join("\n\n");
  if (text) content.push({ type: "text", text });
  const params = {
    model: PARSE_MODEL,
    max_tokens: 1200,
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
    output_config: { format: zodOutputFormat(WireSchema) },
    messages: [{ role: "user" as const, content }],
  };
  return { params, mode: pdfAsText ? "text" : input.pdfBase64 ? "scan" : "email", textOnly: text };
}

export async function parseRateCon(input: { pdfBase64?: string; text?: string; filename?: string }): Promise<RateCon> {
  const { params, mode } = await buildParseRequest(input);
  const res = await claude().messages.parse(params);
  const u = res.usage;
  console.log(`[reader] ${input.filename || "email"} in=${u.input_tokens} out=${u.output_tokens} ${mode}`);
  if (!res.parsed_output) throw new Error("The reader could not make sense of that document.");
  return toRateCon(res.parsed_output);
}
