import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL } from "./client";

/* Read a broker-carrier agreement for the non-solicitation clause. The
   output is what the clause says, quoted, never whether the carrier is
   clear. That is for their attorney. */
export const AgreementSchema = z.object({
  broker: z.string().describe("the broker's legal name as written"),
  broker_mc: z.string().describe('MC number digits, or ""'),
  has_non_solicit: z.boolean(),
  clause: z.string().describe("the non-solicitation / back-solicitation clause verbatim, or the closest language; \"\" if none"),
  page: z.string().describe('where it appears, e.g. "page 4, section 9.2", or ""'),
  term_months: z.number().nullable().describe("length of the restriction in months; null if not stated or indefinite"),
  from_event: z.enum(["last_shipment", "termination", "signing", "unknown"]).describe("what the term runs from"),
  survives_termination: z.boolean(),
  covers_consignees: z.boolean().describe("true if the clause reaches consignees, receivers, delivery locations, or 'any customer or location' of the broker; false if it names only shippers/customers who tendered freight"),
  covers_all_locations: z.boolean().describe("true if it covers every facility the carrier was sent to, not just the named customer"),
  damages: z.string().describe('liquidated damages or commission as written, or ""'),
});
export type AgreementRead = z.infer<typeof AgreementSchema>;

export async function readAgreement(text: string): Promise<AgreementRead> {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 3000,
    system: `You read broker-carrier agreements for a trucking company. Find the non-solicitation (back-solicitation) clause and report exactly what it says. Quote it verbatim. Report the term, what it runs from, whether it survives termination, and whether its wording reaches consignees or delivery locations as well as the broker's shipper customers. When the document is silent on a point, say so with null or false; never infer a term that is not written. This is extraction, not legal advice.`,
    output_config: { format: zodOutputFormat(AgreementSchema) },
    messages: [{ role: "user", content: `Agreement text:\n\n${text.slice(0, 80_000)}` }],
  });
  if (!res.parsed_output) throw new Error("Could not read that agreement.");
  return res.parsed_output;
}
