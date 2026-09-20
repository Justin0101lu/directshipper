import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
export const GET = withSession(async (_req, s) => {
  const db = await getDb();
  return json(await db.select().from(schema.authorities).where(eq(schema.authorities.accountId, s.aid)).orderBy(desc(schema.authorities.loads)));
});
/* Rename an authority (the reader's spelling of your own company is not always yours). */
export const PATCH = withSession(async (req, s) => {
  const b = await body<{ id: string; name?: string; mc?: string }>(req);
  if (!b.id) return fail("id required");
  const db = await getDb();
  const patch: Partial<typeof schema.authorities.$inferInsert> = {};
  if (b.name?.trim()) patch.name = b.name.trim();
  if (b.mc !== undefined) patch.mc = b.mc.replace(/\D/g, "") || null;
  await db.update(schema.authorities).set(patch).where(and(eq(schema.authorities.id, b.id), eq(schema.authorities.accountId, s.aid)));
  return json({ ok: true });
});
