import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
import { askFreight } from "@/lib/ai/ask";
import { aiReady } from "@/lib/ai/client";
export const POST = withSession(async (req, s) => {
  const b = await body<{ q: string }>(req);
  if (!b.q?.trim()) return fail("Ask something.");
  if (!aiReady()) return fail("ANTHROPIC_API_KEY is not set.");
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid));
  const r = await askFreight(s.aid, b.q.trim(), a.company);
  await db.insert(schema.questions).values({ accountId: s.aid, q: b.q.trim(), answer: r.answer, citations: r.citations });
  return json(r);
});
