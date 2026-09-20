import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, json, withSession } from "@/lib/api";
export const POST = withSession(async (req, s) => {
  const b = await body<{ cap: number }>(req);
  const db = await getDb();
  const cap = Math.max(0, Math.min(10000, Math.round(Number(b.cap) || 0)));
  await db.update(schema.accounts).set({ dailyCap: cap }).where(eq(schema.accounts.id, s.aid));
  return json({ cap });
});
