import { body, fail, json, withSession } from "@/lib/api";
import { checkoutPack, checkoutPlan, stripeReady } from "@/lib/stripe";
import { PACKS } from "@/lib/plans";
export const POST = withSession(async (req, s) => {
  if (!stripeReady()) return fail("Stripe is not configured yet.");
  const b = await body<{ plan?: "carrier" | "fleet" | "enterprise"; tokens?: number }>(req);
  try {
    if (b.plan) return json({ url: await checkoutPlan(s.aid, s.email, b.plan) });
    if (b.tokens) { const n = Number(b.tokens); if (!PACKS.includes(n)) return fail(`Packs come in ${PACKS.join(", ")} tokens.`); return json({ url: await checkoutPack(s.aid, s.email, n) }); }
  } catch (e) { return fail((e as Error).message); }
  return fail("plan or tokens required");
});
