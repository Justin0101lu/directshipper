import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/* One token buys one thing we had to go out and find. A miss costs nothing.
   Monthly tokens are spent first, extra (purchased) tokens after. */

export async function balance(accountId: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  return { monthly: a.tokensMonthly, extra: a.tokensExtra, total: a.tokensMonthly + a.tokensExtra, cap: a.dailyCap, plan: a.plan };
}

export async function spentToday(accountId: string) {
  const db = await getDb();
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const [r] = await db.select({ n: sql<number>`coalesce(-sum(${schema.ledger.delta}),0)` })
    .from(schema.ledger)
    .where(and(eq(schema.ledger.accountId, accountId), gte(schema.ledger.createdAt, start), sql`${schema.ledger.delta} < 0`));
  return Number(r?.n || 0);
}

export class TokenError extends Error { constructor(msg: string, public code: "insufficient" | "cap") { super(msg); } }

export async function spend(accountId: string, n: number, what: string, ref?: string) {
  if (n <= 0) return;
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
  await db.insert(schema.ledger).values({ accountId, delta: -n, what, ref });
}

export async function refund(accountId: string, n: number, what: string, ref?: string) {
  const db = await getDb();
  await db.update(schema.accounts).set({ tokensMonthly: sql`${schema.accounts.tokensMonthly} + ${n}` }).where(eq(schema.accounts.id, accountId));
  await db.insert(schema.ledger).values({ accountId, delta: n, what, ref });
}

export async function grant(accountId: string, n: number, what: string, extra = false) {
  const db = await getDb();
  await db.update(schema.accounts).set(
    extra ? { tokensExtra: sql`${schema.accounts.tokensExtra} + ${n}` }
          : { tokensMonthly: sql`${schema.accounts.tokensMonthly} + ${n}` },
  ).where(eq(schema.accounts.id, accountId));
  await db.insert(schema.ledger).values({ accountId, delta: n, what });
}
