import { body, json, withSession } from "@/lib/api";
import { approveOpener } from "@/lib/outreach";
export const POST = withSession(async (req, s) => { const b = await body<{ sequenceId: string; subject?: string; body?: string }>(req); await approveOpener(s.aid, b.sequenceId, { subject: b.subject, body: b.body }); return json({ ok: true }); });
