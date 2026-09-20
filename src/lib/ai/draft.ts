import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL } from "./client";

/* The sequence: seven touches over thirty days. The opener is approved by
   the carrier; email follow-ups send themselves; LinkedIn is copy-only. */
export const SEQUENCE = [
  { day: 0,  channel: "email",    name: "Opener",              approve: true },
  { day: 2,  channel: "linkedin", name: "Connection request",  approve: false },
  { day: 4,  channel: "email",    name: "First follow-up",     approve: false },
  { day: 9,  channel: "linkedin", name: "InMail",              approve: false },
  { day: 12, channel: "email",    name: "The lane, specifically", approve: false },
  { day: 19, channel: "email",    name: "The empty return",    approve: false },
  { day: 30, channel: "email",    name: "Last follow-up",      approve: false },
] as const;

const DraftsSchema = z.object({
  touches: z.array(z.object({
    step: z.number().int(),
    subject: z.string().nullable(),
    body: z.string(),
  })).length(SEQUENCE.length),
});

export type DraftContext = {
  carrier: string; signer: string; contactFirst: string; contactTitle: string | null;
  facility: string; city: string;
  deliveries: number;                 // how often we deliver here per year (0 for lookalikes)
  theirOutbound: string | null;       // e.g. "Phoenix -> Ontario 34%"
  ourHomeLane: string;                // e.g. "Ontario, CA"
  deadhead: string | null;            // e.g. "we run back empty from Phoenix 21% of the time"
  equipment: string;                  // "53' reefer"
  kind: "receiver" | "lookalike";
};

export async function draftSequence(ctx: DraftContext) {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 6000,
    system: `You write outreach for ${ctx.carrier}, a trucking company, to a shipper's transportation contact. Plain, short, specific, no marketing words, no exclamation marks. Every touch stands alone and rests on facts below. Emails: 60-120 words, subject under 60 characters. LinkedIn: under 280 characters, no subject. Signed "${ctx.signer}". Steps, in order:
${SEQUENCE.map((s, i) => `${i}. ${s.name} (${s.channel}, day ${s.day})`).join("\n")}
Facts:
- Contact: ${ctx.contactFirst}${ctx.contactTitle ? ", " + ctx.contactTitle : ""} at ${ctx.facility}, ${ctx.city}
- ${ctx.kind === "receiver" ? `We deliver to this dock about ${ctx.deliveries} times a year. Lead with that.` : "We have no relationship yet. Lead with the freight fit, not with us."}
- Their outbound: ${ctx.theirOutbound || "unknown, do not claim a lane"}
- Our home base: ${ctx.ourHomeLane}. Equipment: ${ctx.equipment}.
- ${ctx.deadhead || "No deadhead claim available; do not invent one."}
Never invent volumes, rates, or names. If a fact is unknown, write around it.`,
    output_config: { format: zodOutputFormat(DraftsSchema), effort: "medium" },
    messages: [{ role: "user", content: "Write all seven touches." }],
  });
  if (!res.parsed_output) throw new Error("Could not draft the sequence.");
  return res.parsed_output.touches;
}
