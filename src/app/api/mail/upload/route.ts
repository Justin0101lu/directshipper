import { getDb, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { fail, json, withSession } from "@/lib/api";
import { ingestPdf } from "@/lib/mail/ingest";
export const POST = withSession(async (req, s) => {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return fail("Choose one or more PDF rate confirmations.");
  const db = await getDb();
  let [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.accountId, s.aid), eq(schema.mailboxes.kind, "upload")));
  if (!mb) [mb] = await db.insert(schema.mailboxes).values({ accountId: s.aid, kind: "upload", address: "upload" }).returning();
  const totals = { stored: 0, skipped: 0, errors: [] as string[] };
  for (const f of files.slice(0, 50)) {
    if (f.size > 20 * 1024 * 1024) { totals.errors.push(`${f.name}: over 20 MB`); continue; }
    const r = await ingestPdf(s.aid, mb.id, Buffer.from(await f.arrayBuffer()), f.name);
    totals.stored += r.stored; totals.skipped += r.skipped; totals.errors.push(...r.errors);
  }
  return json(totals);
});
