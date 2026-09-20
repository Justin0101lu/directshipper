import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { PLANS, type PlanId } from "./plans";
import { grant } from "./tokens";

export const stripeReady = () => !!env.stripe.key;
const stripe = () => new Stripe(env.stripe.key);

async function customerFor(accountId: string, email: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (a.stripeCustomerId) return a.stripeCustomerId;
  const c = await stripe().customers.create({ email, name: a.company, metadata: { accountId } });
  await db.update(schema.accounts).set({ stripeCustomerId: c.id }).where(eq(schema.accounts.id, accountId));
  return c.id;
}

export async function checkoutPlan(accountId: string, email: string, plan: Exclude<PlanId, "free">) {
  const price = plan === "carrier" ? env.stripe.carrier : env.stripe.fleet;
  if (!price) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} is not set.`);
  const s = await stripe().checkout.sessions.create({
    mode: "subscription", customer: await customerFor(accountId, email),
    line_items: [{ price, quantity: 1 }],
    success_url: `${env.appUrl}/app/settings/billing?ok=1`, cancel_url: `${env.appUrl}/app/settings/billing`,
    metadata: { accountId, plan },
    subscription_data: { metadata: { accountId, plan } },
  });
  return s.url!;
}

export async function checkoutPack(accountId: string, email: string, n: number) {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  const p = PLANS[a.plan as PlanId];
  if (!p.extra) throw new Error("Move to Carrier or Fleet to buy extra tokens.");
  const s = await stripe().checkout.sessions.create({
    mode: "payment", customer: await customerFor(accountId, email),
    line_items: [{ price_data: { currency: "usd", unit_amount: Math.round(p.extra * 100), product_data: { name: "Direct Shipper tokens" } }, quantity: n }],
    success_url: `${env.appUrl}/app/settings/billing?ok=1`, cancel_url: `${env.appUrl}/app/settings/billing`,
    metadata: { accountId, tokens: String(n) },
  });
  return s.url!;
}

export async function portal(accountId: string, email: string) {
  const s = await stripe().billingPortal.sessions.create({ customer: await customerFor(accountId, email), return_url: `${env.appUrl}/app/settings/billing` });
  return s.url;
}

/* Webhook: plan changes and monthly grants come from Stripe events, never from the client. */
export async function handleWebhook(rawBody: string, sig: string) {
  const ev = stripe().webhooks.constructEvent(rawBody, sig, env.stripe.webhook);
  const db = await getDb();
  if (ev.type === "checkout.session.completed") {
    const s = ev.data.object;
    const accountId = s.metadata?.accountId;
    if (accountId && s.mode === "payment" && s.metadata?.tokens) await grant(accountId, Number(s.metadata.tokens), `Bought ${s.metadata.tokens} extra tokens`, true);
    if (accountId && s.mode === "subscription" && s.metadata?.plan) {
      const plan = s.metadata.plan as PlanId;
      await db.update(schema.accounts).set({ plan, stripeSubscriptionId: String(s.subscription) }).where(eq(schema.accounts.id, accountId));
      await grant(accountId, PLANS[plan].monthly, `${PLANS[plan].name} plan — first month`);
    }
  }
  if (ev.type === "invoice.paid") {
    const inv = ev.data.object;
    const sub = (inv as unknown as { subscription?: string; parent?: { subscription_details?: { subscription?: string } } });
    const subId = sub.subscription || sub.parent?.subscription_details?.subscription;
    if (subId && inv.billing_reason === "subscription_cycle") {
      const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.stripeSubscriptionId, String(subId)));
      if (a) await grant(a.id, PLANS[a.plan as PlanId].monthly, `${PLANS[a.plan as PlanId].name} plan — monthly tokens`);
    }
  }
  if (ev.type === "customer.subscription.deleted") {
    const sub = ev.data.object;
    await db.update(schema.accounts).set({ plan: "free", stripeSubscriptionId: null }).where(eq(schema.accounts.stripeSubscriptionId, sub.id));
  }
  return ev.type;
}
