import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PLANS, TOPUP_BELOW, type PlanId } from "./plans";

/* One token buys one thing we had to go out and find. A miss costs nothing.
   Included (plan) tokens are spent first, purchased tokens after. A refund goes
   back to the pool the tokens came from. Every entry carries its dollar value
   at the plan's rate so the ledger reads like a receipt. */

export async function balance(accountId: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  return { monthly: a.tokensMonthly, extra: a.tokensExtra, total: a.tokensMonthly + a.tokensExtra, cap: a.dailyCap, plan: a.plan, autoTopup: a.autoTopup };
}

export const rateFor = (plan: string) => (PLANS[plan as PlanId] || PLANS.free).extra;
const centsFor = (plan: string, n: number) => Math.round(n * rateFor(plan) * 100);

export async function spentToday(accountId: string) {
  const db = await getDb();
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const [r] = await db.select({ n: sql<number>`coalesce(-sum(${schema.ledger.delta}),0)` })
    .from(schema.ledger)
    .where(and(eq(schema.ledger.accountId, accountId), gte(schema.ledger.createdAt, start), sql`${schema.ledger.delta} < 0`));
  return Number(r?.n || 0);
}

export class TokenError extends Error { constructor(msg: string, public code: "insufficient" | "cap") { super(msg); } }

/* Returns how the charge split across pools, so a later refund can undo it exactly. */
export async function spend(accountId: string, n: number, what: string, ref?: string) {
  if (n <= 0) return { fromMonthly: 0, fromExtra: 0 };
  const db = await getDb();
  const b = await balance(accountId);
  if (b.total < n) throw new TokenError(`That costs ${n} token${n === 1 ? "" : "s"} and you have ${b.total}. Nothing was charged.`, "insufficient");
  if (b.cap > 0 && (await spentToday(accountId)) + n > b.cap) throw new TokenError(`That would pass your daily cap of ${b.cap} tokens. Nothing was charged. Raise the cap under Billing.`, "cap");
  const fromMonthly = Math.min(b.monthly, n);
  const fromExtra = n - fromMonthly;
  await db.update(schema.accounts).set({
    tokensMonthly: sql`${schema.accounts.tokensMonthly} - ${fromMonthly}`,
    tokensExtra: sql`${schema.accounts.tokensExtra} - ${fromExtra}`,
  }).where(eq(schema.accounts.id, accountId));
  await db.insert(schema.ledger).values({ accountId, delta: -n, extra: fromExtra, cents: -centsFor(b.plan, n), what, ref });
  if (b.autoTopup && b.total - n < TOPUP_BELOW) topUpSoon(accountId);
  return { fromMonthly, fromExtra };
}

/* Refund to the pool the tokens came from. Without a split, the most recent charge
   on the same ref says where they came from. */
export async function refund(accountId: string, n: number, what: string, ref?: string, split?: { fromExtra: number }) {
  if (n <= 0) return;
  const db = await getDb();
  let toExtra = split?.fromExtra;
  if (toExtra === undefined) {
    const [last] = ref ? await db.select().from(schema.ledger).where(and(eq(schema.ledger.accountId, accountId), eq(schema.ledger.ref, ref), sql`${schema.ledger.delta} < 0`)).orderBy(desc(schema.ledger.createdAt)).limit(1) : [];
    toExtra = last ? Math.min(n, last.extra) : 0;
  }
  toExtra = Math.max(0, Math.min(n, toExtra));
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  await db.update(schema.accounts).set({
    tokensMonthly: sql`${schema.accounts.tokensMonthly} + ${n - toExtra}`,
    tokensExtra: sql`${schema.accounts.tokensExtra} + ${toExtra}`,
  }).where(eq(schema.accounts.id, accountId));
  await db.insert(schema.ledger).values({ accountId, delta: n, extra: toExtra, cents: centsFor(a.plan, n), what, ref });
}

/* Add purchased tokens (never expire). `cents` is what was actually paid. */
export async function grantExtra(accountId: string, n: number, what: string, cents = 0) {
  const db = await getDb();
  await db.update(schema.accounts).set({ tokensExtra: sql`${schema.accounts.tokensExtra} + ${n}` }).where(eq(schema.accounts.id, accountId));
  await db.insert(schema.ledger).values({ accountId, delta: n, extra: n, cents, what });
}

/* Set the included pool to the plan's bundle: on the first payment and on every renewal.
   It is a reset, not an addition, so unused included tokens do not pile up. */
export async function resetMonthly(accountId: string, plan: PlanId, what: string) {
  const db = await getDb();
  const n = PLANS[plan].monthly;
  await db.update(schema.accounts).set({ plan, tokensMonthly: n }).where(eq(schema.accounts.id, accountId));
  await db.insert(schema.ledger).values({ accountId, delta: n, extra: 0, cents: 0, what });
}

/* Auto top-up runs off the request path so a reveal never waits on Stripe. */
function topUpSoon(accountId: string) {
  import("./stripe").then((m) => m.autoTopUp(accountId)).catch(() => {});
}
