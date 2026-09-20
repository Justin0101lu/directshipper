import { json, withSession } from "@/lib/api";
import { queue } from "@/lib/outreach";
import { SEQUENCE } from "@/lib/ai/draft";
export const GET = withSession(async (_req, s) => json({ queue: await queue(s.aid), sequence: SEQUENCE }));
