import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL } from "./client";

/* A reply landed. Label it, and draft the answer if one is wanted. */
export const TriageSchema = z.object({
  label: z.enum(["interested", "send_paperwork", "not_now", "wrong_person", "unsubscribe", "unclear"]),
  check_back: z.string().nullable().describe("ISO date to resume if they said when, else null"),
  summary: z.string().describe("one line, what they said"),
  suggested_reply: z.string().nullable().describe("a short reply for the carrier to approve, or null if none is appropriate (unsubscribe, wrong person)"),
});
export type Triage = z.infer<typeof TriageSchema>;

export async function triageReply(args: {
  carrier: string; contactName: string; facility: string; ourThread: string; reply: string;
  profileLine: string;
}): Promise<Triage> {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: `You are the dispatcher's assistant at ${args.carrier}, a trucking company. A shipper replied to our outreach. Label the reply and, when appropriate, draft a short, plain reply in the carrier's voice: specific, no sales language, one ask. Facts you may use: ${args.profileLine}. Never promise a rate you were not given; if they ask for a rate, ask one clarifying question or say a rate is coming. Sign as the carrier.`,
    output_config: { format: zodOutputFormat(TriageSchema), effort: "medium" },
    messages: [{ role: "user", content: `Our thread so far:\n${args.ourThread}\n\nTheir reply (from ${args.contactName} at ${args.facility}):\n${args.reply}` }],
  });
  if (!res.parsed_output) throw new Error("Could not read that reply.");
  return res.parsed_output;
}
