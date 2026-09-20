import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { receivers, lookalikes } from "@/lib/freight/prospects";
export const GET = withSession(async (req, s) => {
  const u = new URL(req.url);
  const db = await getDb();
  const recv = await receivers(s.aid);
  const look = await lookalikes(s.aid, { originState: u.searchParams.get("state") || undefined, equipment: u.searchParams.get("equipment") || undefined, family: u.searchParams.get("family") || undefined, minPerMonth: Number(u.searchParams.get("min") || 4) || 4 });
  const contacts = await db.select().from(schema.contacts).where(and(eq(schema.contacts.accountId, s.aid)));
  return json({ receivers: recv, lookalikes: look, contacts: Object.fromEntries(contacts.map((c) => [c.facilityId, { id: c.id, name: c.name, title: c.title, linkedin: c.linkedin, email: c.email, emailStatus: c.emailStatus, phone: c.phone }])) });
});
