import { body, fail, json, withSession } from "@/lib/api";
import { checkoutPack, checkoutPlan, stripeReady } from "@/lib/stripe";
export const POST = withSession(async (req, s) => {
  if (!stripeReady()) return fail("Stripe is not configured yet.");
  const b = await body<{ plan?: "carrier" | "fleet"; tokens?: number }>(req);
  if (b.plan) return json({ url: await checkoutPlan(s.aid, s.email, b.plan) });
  if (b.tokens) return json({ url: await checkoutPack(s.aid, s.email, Math.max(10, Math.min(1000, Math.round(b.tokens)))) });
  return fail("plan or tokens required");
});
