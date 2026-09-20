import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { balance, spentToday } from "@/lib/tokens";
import { PLANS, TOKEN_ITEMS, FREE_ITEMS } from "@/lib/plans";
import { stripeReady } from "@/lib/stripe";
export const GET = withSession(async (_req, s) => {
  const db = await getDb();
  const b = await balance(s.aid);
  const log = await db.select().from(schema.ledger).where(eq(schema.ledger.accountId, s.aid)).orderBy(desc(schema.ledger.createdAt)).limit(50);
  return json({ ...b, today: await spentToday(s.aid), plans: PLANS, items: TOKEN_ITEMS, free: FREE_ITEMS, log, stripe: stripeReady() });
});
