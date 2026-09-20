import { body, json, withSession } from "@/lib/api";
import { startSequence } from "@/lib/outreach";
export const POST = withSession(async (req, s) => { const b = await body<{ contactId: string }>(req); return json(await startSequence(s.aid, b.contactId)); });
