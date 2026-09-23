import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
import { PLANS, type PlanId } from "@/lib/plans";
/* Autopilot dial and its daily limit. */
export const POST = withSession(async (req, s) => {
  const patch: Partial<typeof schema.accounts.$inferInsert> = {};
  const b = await body<{ autopilot?: string; autoPerDay?: number; emailsPerDay?: number; gapMin?: number; gapMax?: number; callsPerDay?: number }>(req);
  const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  if (b.emailsPerDay !== undefined) patch.emailsPerDay = clamp(b.emailsPerDay, 1, 50);        // past 50 a day a cold inbox burns
  if (b.gapMin !== undefined) patch.gapMin = clamp(b.gapMin, 1, 60);
  if (b.gapMax !== undefined) patch.gapMax = clamp(b.gapMax, 1, 120);
  if (patch.gapMin !== undefined && patch.gapMax !== undefined && patch.gapMax < patch.gapMin) patch.gapMax = patch.gapMin;
  if (b.callsPerDay !== undefined) patch.callsPerDay = clamp(b.callsPerDay, 0, 40);
  if (b.autopilot !== undefined) { if (!["off", "draft", "send"].includes(b.autopilot)) return fail("autopilot must be off, draft or send"); patch.autopilot = b.autopilot; }
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid));
  const ceiling = PLANS[a.plan as PlanId].perDay;
  if (b.autoPerDay !== undefined) patch.autoPerDay = Math.max(0, Math.min(ceiling || 50, Math.round(Number(b.autoPerDay) || 0)));
  if (b.autopilot === "send" && !PLANS[a.plan as PlanId].outreach) return fail("Send mode is on Carrier and up. Draft mode stays free.", 402);
  await db.update(schema.accounts).set(patch).where(eq(schema.accounts.id, s.aid));
  return json({ ok: true });
});
