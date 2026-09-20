import Stripe from "stripe";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { PLANS, PACKS, TOPUP_PACK, packPrice, type PlanId } from "./plans";
import { grantExtra, resetMonthly } from "./tokens";

export const stripeReady = () => !!env.stripe.key;
const stripe = () => new Stripe(env.stripe.key);
const RETURN = () => `${env.appUrl}/app/settings/billing`;

async function customerFor(accountId: string, email: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (a.stripeCustomerId) return a.stripeCustomerId;
  const c = await stripe().customers.create({ email, name: a.company, metadata: { accountId } });
  await db.update(schema.accounts).set({ stripeCustomerId: c.id }).where(eq(schema.accounts.id, accountId));
  return c.id;
}

export const priceFor = (plan: Exclude<PlanId, "free">) => env.stripe.prices[plan];

export async function checkoutPlan(accountId: string, email: string, plan: Exclude<PlanId, "free">) {
  const price = priceFor(plan);
  if (!price) throw new Error(plan === "enterprise" ? "Enterprise is set up by hand for now. Email us and we will switch you on the same day." : `STRIPE_PRICE_${plan.toUpperCase()} is not set.`);
  const s = await stripe().checkout.sessions.create({
    mode: "subscription", customer: await customerFor(accountId, email),
    line_items: [{ price, quantity: 1 }],
    success_url: `${RETURN()}?ok=1`, cancel_url: RETURN(),
    metadata: { accountId, plan },
    subscription_data: { metadata: { accountId, plan } },
  });
  return s.url!;
}

/* Packs are sold at the plan's rate and charged once. The card is kept for auto top-up. */
export async function checkoutPack(accountId: string, email: string, n: number) {
  if (!PACKS.includes(n)) throw new Error(`Packs come in ${PACKS.join(", ")} tokens.`);
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  const plan = a.plan as PlanId;
  const s = await stripe().checkout.sessions.create({
    mode: "payment", customer: await customerFor(accountId, email),
    line_items: [{ price_data: { currency: "usd", unit_amount: Math.round(packPrice(plan, n) * 100), product_data: { name: `Direct Shipper — ${n} tokens` } }, quantity: 1 }],
    payment_intent_data: { setup_future_usage: "off_session", metadata: { accountId, tokens: String(n) } },
    success_url: `${RETURN()}?ok=1`, cancel_url: RETURN(),
    metadata: { accountId, tokens: String(n) },
  });
  return s.url!;
}

export async function portal(accountId: string, email: string) {
  const s = await stripe().billingPortal.sessions.create({ customer: await customerFor(accountId, email), return_url: RETURN() });
  return s.url;
}

/* Does the customer have a card on file we may charge without them present? */
export async function savedCard(accountId: string) {
  if (!stripeReady()) return false;
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (!a.stripeCustomerId) return false;
  const pms = await stripe().paymentMethods.list({ customer: a.stripeCustomerId, type: "card", limit: 1 });
  return pms.data.length > 0;
}

/* Buy the smallest pack on the saved card. At most once a day, and only when the
   account opted in. Any failure is logged in the ledger as a zero-token line so the
   carrier can see why the agent stopped. */
export async function autoTopUp(accountId: string) {
  if (!stripeReady()) return false;
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (!a?.autoTopup || !a.stripeCustomerId) return false;
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const [today] = await db.select({ n: sql<number>`count(*)` }).from(schema.ledger)
    .where(and(eq(schema.ledger.accountId, accountId), gte(schema.ledger.createdAt, start), sql`${schema.ledger.what} like 'Auto top-up%'`));
  if (Number(today?.n || 0) > 0) return false;
  const pms = await stripe().paymentMethods.list({ customer: a.stripeCustomerId, type: "card", limit: 1 });
  const pm = pms.data[0];
  if (!pm) { await db.insert(schema.ledger).values({ accountId, delta: 0, what: "Auto top-up skipped — no card on file. Buy a pack once to save one." }); return false; }
  const cents = Math.round(packPrice(a.plan as PlanId, TOPUP_PACK) * 100);
  try {
    const pi = await stripe().paymentIntents.create({ amount: cents, currency: "usd", customer: a.stripeCustomerId, payment_method: pm.id, off_session: true, confirm: true, description: `Direct Shipper — auto top-up, ${TOPUP_PACK} tokens`, metadata: { accountId, tokens: String(TOPUP_PACK), auto: "1" } });
    if (pi.status !== "succeeded") throw new Error(pi.status);
    await grantExtra(accountId, TOPUP_PACK, `Auto top-up — ${TOPUP_PACK} tokens`, cents);
    return true;
  } catch (e) {
    await db.update(schema.accounts).set({ autoTopup: false }).where(eq(schema.accounts.id, accountId));
    await db.insert(schema.ledger).values({ accountId, delta: 0, what: `Auto top-up failed and was switched off — ${(e as Error).message}` });
    return false;
  }
}

/* Webhook: plan changes and monthly bundles come from Stripe events, never from the client. */
export async function handleWebhook(rawBody: string, sig: string) {
  const ev = stripe().webhooks.constructEvent(rawBody, sig, env.stripe.webhook);
  const db = await getDb();
  if (ev.type === "checkout.session.completed") {
    const s = ev.data.object;
    const accountId = s.metadata?.accountId;
    if (accountId && s.mode === "payment" && s.metadata?.tokens) {
      const n = Number(s.metadata.tokens);
      await grantExtra(accountId, n, `Bought ${n} tokens`, s.amount_total || 0);
    }
    if (accountId && s.mode === "subscription" && s.metadata?.plan) {
      const plan = s.metadata.plan as PlanId;
      await db.update(schema.accounts).set({ stripeSubscriptionId: String(s.subscription) }).where(eq(schema.accounts.id, accountId));
      await resetMonthly(accountId, plan, `${PLANS[plan].name} plan — ${PLANS[plan].monthly} tokens included`);
    }
  }
  if (ev.type === "invoice.paid") {
    const inv = ev.data.object;
    const sub = (inv as unknown as { subscription?: string; parent?: { subscription_details?: { subscription?: string } } });
    const subId = sub.subscription || sub.parent?.subscription_details?.subscription;
    if (subId && inv.billing_reason === "subscription_cycle") {
      const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.stripeSubscriptionId, String(subId)));
      if (a) { const plan = a.plan as PlanId; await resetMonthly(a.id, plan, `${PLANS[plan].name} plan renewed — ${PLANS[plan].monthly} tokens included`); }
    }
  }
  if (ev.type === "customer.subscription.deleted") {
    const sub = ev.data.object;
    const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.stripeSubscriptionId, sub.id));
    if (a) {
      await db.update(schema.accounts).set({ plan: "free", stripeSubscriptionId: null, tokensMonthly: 0, autoTopup: false, autopilot: a.autopilot === "send" ? "draft" : a.autopilot }).where(eq(schema.accounts.id, a.id));
      await db.insert(schema.ledger).values({ accountId: a.id, delta: -a.tokensMonthly, cents: 0, what: "Back on Free — included tokens ended. Purchased tokens stay." });
    }
  }
  return ev.type;
}
