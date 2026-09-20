import { json, withSession } from "@/lib/api";
import { cards } from "@/lib/outreach";
import { SEQUENCE } from "@/lib/ai/draft";
export const GET = withSession(async (_req, s) => json({ cards: await cards(s.aid), sequence: SEQUENCE }));
