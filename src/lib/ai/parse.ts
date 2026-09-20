import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, MODEL } from "./client";

/* The rate con reader. One document in, one structured load out.
   Runs on PDFs (base64) and on plain text (email bodies, OCR'd scans). */

export const RateConSchema = z.object({
  is_rate_confirmation: z.boolean().describe("true only if this document is a carrier rate confirmation / load tender for a truckload shipment"),
  load_number: z.string().nullable(),
  broker: z.object({
    name: z.string().nullable(),
    mc: z.string().nullable().describe("MC number digits only, no prefix"),
    email: z.string().nullable(),
  }),
  shipper: z.string().nullable().describe("the company that owns the freight, if it can be told apart from the pickup facility"),
  pickup: z.object({
    facility: z.string().nullable(),
    street: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable().describe("two-letter US state or CA province"),
    zip: z.string().nullable(),
    at: z.string().nullable().describe("ISO 8601 date or datetime"),
  }),
  delivery: z.object({
    facility: z.string().nullable(),
    street: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    zip: z.string().nullable(),
    at: z.string().nullable(),
  }),
  commodity: z.string().nullable(),
  family: z.enum(["frozen", "refrigerated", "produce", "beverage", "dry", "other", "unknown"]),
  equipment: z.enum(["reefer", "dry_van", "flatbed", "other", "unknown"]),
  temp_f: z.number().nullable(),
  miles: z.number().nullable(),
  rate_total: z.number().nullable().describe("total linehaul to the carrier in USD, including fuel if stated as all-in"),
  confidence: z.number().min(0).max(1),
});
export type RateCon = z.infer<typeof RateConSchema>;

const SYSTEM = `You read trucking paperwork for a small carrier. Given one document, extract the fields of the rate confirmation exactly as written. Rules:
- Broker is the party paying the carrier (the tendering company on the confirmation), never the carrier.
- Shipper is the company that owns the freight when the paperwork names one distinct from the pickup facility (for example a 3PL cold storage pickup with a "Customer" or "Account" line). Otherwise null.
- Family: frozen (temp at or below 0F or the word frozen), refrigerated (33-45F, chilled, cold), produce (fresh fruit/vegetables, even if refrigerated), beverage, dry, other. Unknown if not stated.
- Equipment: reefer for any refrigerated trailer; dry_van for van; flatbed; other; unknown.
- Miles: as stated; do not estimate.
- Rate total: the carrier's linehaul total. If separate fuel surcharge is stated, add it. Ignore accessorials.
- Set is_rate_confirmation false for anything that is not a rate con or load tender (invoices, BOLs, newsletters).
- Never invent a value. Use null when it is not on the page.`;

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
    output_config: { format: zodOutputFormat(RateConSchema), effort: "medium" },
    messages: [{ role: "user", content }],
  });
  if (!res.parsed_output) throw new Error("The reader could not make sense of that document.");
  return res.parsed_output;
}
