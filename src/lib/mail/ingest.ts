import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { simpleParser, type ParsedMail } from "mailparser";
import { getDb, schema } from "@/db";
import { looksLikeRateCon } from "./filter";
import { parseRateCon, buildParseRequest, type RateCon } from "@/lib/ai/parse";
import { batchEnabled, enqueue } from "@/lib/ai/batch";
import { aiReady } from "@/lib/ai/client";
import { storeLoad } from "@/lib/freight/store";

/* From a raw MIME message (or a lone PDF) to a stored load. */

export type IngestResult = { stored: number; skipped: number; errors: string[]; dupes?: number; queued?: number };

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
async function seenHash(accountId: string, hash: string) {
  const db = await getDb();
  const r = await db.select({ id: schema.loads.id }).from(schema.loads).where(and(eq(schema.loads.accountId, accountId), eq(schema.loads.docHash, hash))).limit(1);
  return r.length > 0;
}

/* Same broker, same load number, already stored: a revised or re-sent
   confirmation. Skipped before the model. Load numbers are taken from the
   subject; the broker from the sender's domain. */
async function seenLoadNumber(accountId: string, subject: string, from: string | null) {
  const nums = (subject.match(/\b\d{5,10}\b/g) || []).slice(0, 3);
  const domain = from?.split("@")[1]?.toLowerCase();
  if (!nums.length || !domain) return false;
  const db = await getDb();
  const rows = await db.select({ ln: schema.loads.loadNumber, be: schema.loads.brokerEmail }).from(schema.loads)
    .where(and(eq(schema.loads.accountId, accountId), inArray(schema.loads.loadNumber, nums)));
  return rows.some((r) => (r.be || "").toLowerCase().endsWith("@" + domain));
}

export async function ingestMime(accountId: string, mailboxId: string | null, raw: Buffer | string, sourceRef: string, opts: { batch?: boolean } = {}): Promise<IngestResult> {
  const mail: ParsedMail = await simpleParser(raw);
  const subject = mail.subject || "";
  const text = mail.text || (mail.html ? String(mail.html).replace(/<[^>]+>/g, " ") : "");
  const pdfs = (mail.attachments || []).filter((a) => a.contentType === "application/pdf" || /\.pdf$/i.test(a.filename || ""));
  if (!looksLikeRateCon(subject, text, (mail.attachments || []).map((a) => a.filename || ""))) return { stored: 0, skipped: 1, errors: [] };

  const res: IngestResult = { stored: 0, skipped: 0, errors: [], dupes: 0 };
  const from = mail.from?.value?.[0]?.address || null;
  if (await seenLoadNumber(accountId, subject, from)) { res.dupes = 1; return res; }
  const docs: { pdfBase64?: string; text?: string; ref: string; filename?: string; hash: string }[] = pdfs.length
    ? pdfs.slice(0, 3).map((p, i) => ({ pdfBase64: p.content.toString("base64"), text: `Subject: ${subject}\nFrom: ${from ?? ""}\n\n${text.slice(0, 1200)}`, ref: `${sourceRef}#${i}`, filename: p.filename || undefined, hash: sha(p.content) }))
    : [{ text: `Email subject: ${subject}\nFrom: ${from ?? ""}\n\n${text}`, ref: sourceRef, hash: sha(text.replace(/\s+/g, " ").trim().toLowerCase()) }];

  for (const d of docs) {
    try {
      if (await seenHash(accountId, d.hash)) { res.dupes!++; continue; }    // the same rate con sent again: free skip
      if (opts.batch && batchEnabled()) {
        /* History scan: queue the trimmed text for the half-price batch instead of reading now. */
        const { textOnly, mode } = await buildParseRequest({ pdfBase64: d.pdfBase64, text: d.text, filename: d.filename });
        if (mode !== "scan") { await enqueue({ accountId, mailboxId, sourceRef: d.ref, docHash: d.hash, filename: d.filename, fromEmail: from, text: textOnly, receivedAt: mail.date || new Date() }); res.queued = (res.queued || 0) + 1; continue; }
      }
      const rc = await readDoc({ pdfBase64: d.pdfBase64, text: d.text, filename: d.filename });
      if (!rc || !rc.is_rate_confirmation) { res.skipped++; continue; }
      if (!rc.broker.email && from) rc.broker.email = from;
      const stored = await storeLoad(accountId, mailboxId, d.ref, rc, mail.date || new Date(), d.hash);
      if (stored) res.stored++; else res.skipped++;
    } catch (e) { res.errors.push(`${d.ref}: ${(e as Error).message}`); }
  }
  return res;
}

/* Already-split parts (the forwarding webhook hands us JSON, not MIME). */
export async function ingestParts(accountId: string, mailboxId: string | null, m: { subject: string; from: string | null; text: string; pdfs: { name: string; buf: Buffer }[]; ref: string; date?: Date }): Promise<IngestResult> {
  if (!looksLikeRateCon(m.subject, m.text, m.pdfs.map((p) => p.name))) return { stored: 0, skipped: 1, errors: [] };
  const res: IngestResult = { stored: 0, skipped: 0, errors: [], dupes: 0 };
  const docs = m.pdfs.length
    ? m.pdfs.slice(0, 3).map((p, i) => ({ pdfBase64: p.buf.toString("base64"), text: `Subject: ${m.subject}\nFrom: ${m.from ?? ""}\n\n${m.text.slice(0, 1200)}`, ref: `${m.ref}#${i}`, filename: p.name, hash: sha(p.buf) }))
    : [{ text: `Email subject: ${m.subject}\nFrom: ${m.from ?? ""}\n\n${m.text}`, ref: m.ref, pdfBase64: undefined as string | undefined, filename: undefined as string | undefined, hash: sha(m.text.replace(/\s+/g, " ").trim().toLowerCase()) }];
  for (const d of docs) {
    try {
      if (await seenHash(accountId, d.hash)) { res.dupes!++; continue; }
      const rc = await readDoc({ pdfBase64: d.pdfBase64, text: d.text, filename: d.filename });
      if (!rc || !rc.is_rate_confirmation) { res.skipped++; continue; }
      if (!rc.broker.email && m.from) rc.broker.email = m.from;
      const stored = await storeLoad(accountId, mailboxId, d.ref, rc, m.date || new Date(), d.hash);
      if (stored) res.stored++; else res.skipped++;
    } catch (e) { console.error("[reader]", d.ref, e); res.errors.push(`${d.ref}: ${(e as Error).message}`); }
  }
  return res;
}

export async function ingestPdf(accountId: string, mailboxId: string | null, buf: Buffer, filename: string): Promise<IngestResult> {
  try {
    const hash = sha(buf);
    if (await seenHash(accountId, hash)) return { stored: 0, skipped: 0, errors: [], dupes: 1 };
    const rc = await readDoc({ pdfBase64: buf.toString("base64"), filename });
    if (!rc || !rc.is_rate_confirmation) return { stored: 0, skipped: 1, errors: [] };
    const stored = await storeLoad(accountId, mailboxId, `upload:${filename}:${buf.length}`, rc, new Date(), hash);
    return { stored: stored ? 1 : 0, skipped: stored ? 0 : 1, errors: [] };
  } catch (e) { console.error("[reader]", filename, e); return { stored: 0, skipped: 0, errors: [(e as Error).message] }; }
}

async function readDoc(d: { pdfBase64?: string; text?: string; filename?: string }): Promise<RateCon | null> {
  if (!aiReady()) throw new Error("ANTHROPIC_API_KEY is not set, so the rate con reader is off.");
  return parseRateCon(d);
}
