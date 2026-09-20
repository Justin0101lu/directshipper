import { body, fail, json, withSession } from "@/lib/api";
import { setSender } from "@/lib/outreach";
export const POST = withSession(async (req, s) => { const b = await body<{ sequenceId: string; mailboxId: string }>(req); if (!b.sequenceId || !b.mailboxId) return fail("sequenceId and mailboxId required"); await setSender(s.aid, b.sequenceId, b.mailboxId); return json({ ok: true }); });
