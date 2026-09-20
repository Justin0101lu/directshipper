import { body, json, withSession } from "@/lib/api";
import { pause } from "@/lib/outreach";
export const POST = withSession(async (req, s) => { const b = await body<{ sequenceId: string; on: boolean }>(req); await pause(s.aid, b.sequenceId, !!b.on); return json({ ok: true }); });
