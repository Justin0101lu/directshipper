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
  carrier: string; signer: string;
  contactFirst: string | null; contactTitle: string | null;     // null: write to {{first}}, filled at send time
  facility: string; city: string;
  relationship: string;                 // plain-English history with this warehouse, from the paperwork
  kind: "receiver" | "shipper" | "both" | "lookalike";
  theirOutbound: string | null;         // what the network sees them ship, if known
  ourHome: string; equipment: string; family: string;
  deadhead: string | null;              // e.g. "we run back empty from Phoenix 21% of the time"
  lanesIn: string | null;               // where we come from when we deliver to them
};

export async function draftSequence(ctx: DraftContext) {
  const who = ctx.contactFirst || "{{first}}";
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 6000,
    system: `You write outreach for ${ctx.carrier}, a trucking company, to a shipper's transportation contact. Plain, short, specific, no marketing words, no exclamation marks, no flattery. Every touch stands alone and rests only on the facts below; a reader should feel this was written for their warehouse and nobody else's. Emails: 60-120 words, subject under 60 characters, no subject line inside the body. LinkedIn: under 280 characters, no subject. Address the person as ${who}${ctx.contactFirst ? "" : " (a placeholder that is replaced with their first name; write it exactly as {{first}})"}. Sign every email exactly with the placeholder {{signer}} on its own last line (it is replaced with the sender's name and title when sent). Steps, in order:
${SEQUENCE.map((s, i) => `${i}. ${s.name} (${s.channel}, day ${s.day})`).join("\n")}
Facts:
- Dock: ${ctx.facility}, ${ctx.city}
- Our history there: ${ctx.relationship}
- Relationship: ${ctx.kind === "receiver" ? "we deliver to them; nobody brokered that relationship. Lead with being at their warehouse, and with the outbound we could take from there." : ctx.kind === "shipper" ? "we already pick up from them, through brokers. Lead with the loads we already run for them and ask about going direct." : ctx.kind === "both" ? "we both deliver to and pick up from them. Lead with how often our trucks are there." : "no relationship yet. Lead with the freight fit, not with us."}
- Their outbound: ${ctx.theirOutbound || "unknown; do not claim a lane"}
- ${ctx.lanesIn ? `We usually arrive from ${ctx.lanesIn}.` : ""}
- Our home base: ${ctx.ourHome}. We run ${ctx.equipment}, mostly ${ctx.family}.
- ${ctx.deadhead || "No deadhead claim available; do not invent one."}
Never invent volumes, rates, names, or dates. If a fact is unknown, write around it. Vary the angle across touches: the warehouse visit, their outbound lane, the empty return, a short check-in, a last note.`,
    output_config: { format: zodOutputFormat(DraftsSchema), effort: "medium" },
    messages: [{ role: "user", content: "Write all seven touches." }],
  });
  if (!res.parsed_output) throw new Error("Could not draft the sequence.");
  return res.parsed_output.touches;
}

/* Fill the placeholder at send time. */
export const personalize = (text: string, first: string | null, signer?: string | null) => text.replace(/\{\{first\}\}/g, first || "there").replace(/\{\{signer\}\}/g, signer || "");
