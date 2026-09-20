import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
/* Autopilot dial and its daily limit. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ autopilot?: string; autoPerDay?: number }>(req);
  const patch: Partial<typeof schema.accounts.$inferInsert> = {};
  if (b.autopilot !== undefined) { if (!["off", "draft", "send"].includes(b.autopilot)) return fail("autopilot must be off, draft or send"); patch.autopilot = b.autopilot; }
  if (b.autoPerDay !== undefined) patch.autoPerDay = Math.max(0, Math.min(50, Math.round(Number(b.autoPerDay) || 0)));
  const db = await getDb();
  await db.update(schema.accounts).set(patch).where(eq(schema.accounts.id, s.aid));
  return json({ ok: true });
});
