import { and, eq, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PLANS, type PlanId } from "@/lib/plans";
/* How many sending inboxes (Gmail / Outlook) the plan allows. Upload and forwarding never count. */
export async function inboxRoom(accountId: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  const plan = PLANS[a.plan as PlanId];
  const have = await db.select({ id: schema.mailboxes.id }).from(schema.mailboxes)
    .where(and(eq(schema.mailboxes.accountId, accountId), or(eq(schema.mailboxes.kind, "gmail_imap"), eq(schema.mailboxes.kind, "microsoft"))));
  if (have.length < plan.inboxes) return { ok: true as const, have: have.length, allowed: plan.inboxes };
  const next = plan.id === "free" || plan.id === "carrier" ? "Fleet" : "Enterprise";
  return { ok: false as const, have: have.length, allowed: plan.inboxes, why: `${plan.name} allows ${plan.inboxes} connected inbox${plan.inboxes === 1 ? "" : "es"}. Remove one, or move to ${next} for more.` };
}
