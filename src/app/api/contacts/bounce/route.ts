import { body, json, withSession } from "@/lib/api";
import { reportBounce } from "@/lib/enrich";
export const POST = withSession(async (req, s) => { const b = await body<{ contactId: string }>(req); await reportBounce(s.aid, b.contactId); return json({ ok: true }); });
