import { body, json, withSession } from "@/lib/api";
import { prepareTop } from "@/lib/outreach";
/* "Prepare my top docks": drafts sequences for the warmest docks that lack one. */
export const POST = withSession(async (req, s) => { const b = await body<{ n?: number }>(req); const made = await prepareTop(s.aid, Math.min(10, Math.max(1, b.n || 5))); return json({ made }); });
