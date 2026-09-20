import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { balance, spentToday } from "@/lib/tokens";
import { PLANS, PACKS, TOKEN_ITEMS, FREE_ITEMS, TOPUP_PACK, TOPUP_BELOW, WELCOME_TOKENS, packPrice, type PlanId } from "@/lib/plans";
import { priceFor, savedCard, stripeReady } from "@/lib/stripe";
export const GET = withSession(async (_req, s) => {
  const db = await getDb();
  const b = await balance(s.aid);
  const log = await db.select().from(schema.ledger).where(eq(schema.ledger.accountId, s.aid)).orderBy(desc(schema.ledger.createdAt)).limit(60);
  let card = false; try { card = await savedCard(s.aid); } catch { /* stripe down: show as no card */ }
  const packs = PACKS.map((n) => ({ tokens: n, price: packPrice(b.plan as PlanId, n) }));
  const buyable = Object.fromEntries((Object.keys(PLANS) as PlanId[]).map((p) => [p, p === "free" ? true : !!priceFor(p)]));
  return json({ ...b, today: await spentToday(s.aid), plans: PLANS, packs, topup: { pack: TOPUP_PACK, below: TOPUP_BELOW, price: packPrice(b.plan as PlanId, TOPUP_PACK) }, welcome: WELCOME_TOKENS, items: TOKEN_ITEMS, free: FREE_ITEMS, log, stripe: stripeReady(), card, buyable });
});
