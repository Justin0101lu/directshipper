import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
import { PLANS, type PlanId } from "@/lib/plans";
/* Autopilot dial and its daily limit. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ autopilot?: string; autoPerDay?: number }>(req);
  const patch: Partial<typeof schema.accounts.$inferInsert> = {};
  if (b.autopilot !== undefined) { if (!["off", "draft", "send"].includes(b.autopilot)) return fail("autopilot must be off, draft or send"); patch.autopilot = b.autopilot; }
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid));
  const ceiling = PLANS[a.plan as PlanId].perDay;
  if (b.autoPerDay !== undefined) patch.autoPerDay = Math.max(0, Math.min(ceiling || 50, Math.round(Number(b.autoPerDay) || 0)));
  if (b.autopilot === "send" && !PLANS[a.plan as PlanId].outreach) return fail("Send mode is on Carrier and up. Draft mode stays free.", 402);
  await db.update(schema.accounts).set(patch).where(eq(schema.accounts.id, s.aid));
  return json({ ok: true });
});
