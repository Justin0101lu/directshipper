import { body, fail, json, withSession } from "@/lib/api";
import { attachContact } from "@/lib/outreach";
export const POST = withSession(async (req, s) => { const b = await body<{ sequenceId: string; contactId: string }>(req); if (!b.sequenceId || !b.contactId) return fail("sequenceId and contactId required"); await attachContact(s.aid, b.sequenceId, b.contactId); return json({ ok: true }); });
