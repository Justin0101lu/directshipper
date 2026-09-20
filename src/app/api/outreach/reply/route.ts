import { body, fail, json, withSession } from "@/lib/api";
import { sendSuggestedReply } from "@/lib/outreach";
export const POST = withSession(async (req, s) => { const b = await body<{ sequenceId: string; body: string }>(req); if (!b.body) return fail("Nothing to send."); await sendSuggestedReply(s.aid, b.sequenceId, b.body); return json({ ok: true }); });
