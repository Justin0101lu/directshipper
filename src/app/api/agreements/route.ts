import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fail, json, withSession } from "@/lib/api";
import { readAgreement } from "@/lib/ai/agreement";
import { aiReady } from "@/lib/ai/client";
import { PLANS, type PlanId } from "@/lib/plans";

export const GET = withSession(async (_req, s) => {
  const db = await getDb();
  return json(await db.select().from(schema.agreements).where(eq(schema.agreements.accountId, s.aid)).orderBy(desc(schema.agreements.createdAt)));
});

/* Upload a broker-carrier agreement (PDF). The clause is extracted and stored as written. */
export const POST = withSession(async (req, s) => {
  if (!aiReady()) return fail("ANTHROPIC_API_KEY is not set.");
  { const db = await getDb(); const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid)); if (!PLANS[a.plan as PlanId].agreements) return fail("Uploading broker agreements to clear holds is on Carrier and up.", 402); }
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return fail("Choose the signed broker-carrier agreement as a PDF.");
  const db = await getDb();
  const out = [];
  for (const f of files.slice(0, 10)) {
    const buf = Buffer.from(await f.arrayBuffer());
    let text = "";
    try { const { PDFParse } = await import("pdf-parse"); const p = new PDFParse({ data: buf }); text = (await p.getText()).text; await p.destroy?.(); } catch { /* fall through */ }
    if (text.trim().length < 200) { out.push({ filename: f.name, error: "No text layer in this PDF. A scanned agreement needs to be OCRed first." }); continue; }
    try {
      const r = await readAgreement(text);
      if (!r.has_non_solicit) { out.push({ filename: f.name, broker: r.broker, note: "No non-solicitation clause found. Nothing recorded; the broad assumption still applies to that broker." }); continue; }
      const [row] = await db.insert(schema.agreements).values({
        accountId: s.aid, broker: r.broker, brokerMc: r.broker_mc || null, termMonths: r.term_months, fromEvent: r.from_event, survives: r.survives_termination,
        coversConsignees: r.covers_consignees, coversAllLocations: r.covers_all_locations, damages: r.damages || null, clause: r.clause, page: r.page || null, filename: f.name,
      }).returning();
      out.push({ filename: f.name, broker: row.broker, termMonths: row.termMonths, coversConsignees: row.coversConsignees, id: row.id });
    } catch (e) { out.push({ filename: f.name, error: (e as Error).message }); }
  }
  return json(out);
});

export const DELETE = withSession(async (req, s) => {
  const { id } = await req.json();
  const db = await getDb();
  await db.delete(schema.agreements).where(eq(schema.agreements.id, id));
  return json({ ok: true, accountId: s.aid });
});
