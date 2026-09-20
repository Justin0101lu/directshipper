import { simpleParser, type ParsedMail } from "mailparser";
import { looksLikeRateCon } from "./filter";
import { parseRateCon, type RateCon } from "@/lib/ai/parse";
import { aiReady } from "@/lib/ai/client";
import { storeLoad } from "@/lib/freight/store";

/* From a raw MIME message (or a lone PDF) to a stored load. */

export type IngestResult = { stored: number; skipped: number; errors: string[] };

export async function ingestMime(accountId: string, mailboxId: string | null, raw: Buffer | string, sourceRef: string): Promise<IngestResult> {
  const mail: ParsedMail = await simpleParser(raw);
  const subject = mail.subject || "";
  const text = mail.text || (mail.html ? String(mail.html).replace(/<[^>]+>/g, " ") : "");
  const pdfs = (mail.attachments || []).filter((a) => a.contentType === "application/pdf" || /\.pdf$/i.test(a.filename || ""));
  if (!looksLikeRateCon(subject, text, (mail.attachments || []).map((a) => a.filename || ""))) return { stored: 0, skipped: 1, errors: [] };

  const res: IngestResult = { stored: 0, skipped: 0, errors: [] };
  const from = mail.from?.value?.[0]?.address || null;
  const docs: { pdfBase64?: string; text?: string; ref: string; filename?: string }[] = pdfs.length
    ? pdfs.slice(0, 3).map((p, i) => ({ pdfBase64: p.content.toString("base64"), text: `Subject: ${subject}\nFrom: ${from ?? ""}\n\n${text.slice(0, 1200)}`, ref: `${sourceRef}#${i}`, filename: p.filename || undefined }))
    : [{ text: `Email subject: ${subject}\nFrom: ${from ?? ""}\n\n${text}`, ref: sourceRef }];

  for (const d of docs) {
    try {
      const rc = await readDoc({ pdfBase64: d.pdfBase64, text: d.text, filename: d.filename });
      if (!rc || !rc.is_rate_confirmation) { res.skipped++; continue; }
      if (!rc.broker.email && from) rc.broker.email = from;
      const stored = await storeLoad(accountId, mailboxId, d.ref, rc, mail.date || new Date());
      if (stored) res.stored++; else res.skipped++;
    } catch (e) { res.errors.push(`${d.ref}: ${(e as Error).message}`); }
  }
  return res;
}

/* Already-split parts (the forwarding webhook hands us JSON, not MIME). */
export async function ingestParts(accountId: string, mailboxId: string | null, m: { subject: string; from: string | null; text: string; pdfs: { name: string; buf: Buffer }[]; ref: string; date?: Date }): Promise<IngestResult> {
  if (!looksLikeRateCon(m.subject, m.text, m.pdfs.map((p) => p.name))) return { stored: 0, skipped: 1, errors: [] };
  const res: IngestResult = { stored: 0, skipped: 0, errors: [] };
  const docs = m.pdfs.length
    ? m.pdfs.map((p, i) => ({ pdfBase64: p.buf.toString("base64"), text: `Email subject: ${m.subject}\nFrom: ${m.from ?? ""}\n\n${m.text.slice(0, 4000)}`, ref: `${m.ref}#${i}`, filename: p.name }))
    : [{ text: `Email subject: ${m.subject}\nFrom: ${m.from ?? ""}\n\n${m.text}`, ref: m.ref, pdfBase64: undefined as string | undefined, filename: undefined as string | undefined }];
  for (const d of docs) {
    try {
      const rc = await readDoc({ pdfBase64: d.pdfBase64, text: d.text, filename: d.filename });
      if (!rc || !rc.is_rate_confirmation) { res.skipped++; continue; }
      if (!rc.broker.email && m.from) rc.broker.email = m.from;
      const stored = await storeLoad(accountId, mailboxId, d.ref, rc, m.date || new Date());
      if (stored) res.stored++; else res.skipped++;
    } catch (e) { console.error("[reader]", d.ref, e); res.errors.push(`${d.ref}: ${(e as Error).message}`); }
  }
  return res;
}

export async function ingestPdf(accountId: string, mailboxId: string | null, buf: Buffer, filename: string): Promise<IngestResult> {
  try {
    const rc = await readDoc({ pdfBase64: buf.toString("base64"), filename });
    if (!rc || !rc.is_rate_confirmation) return { stored: 0, skipped: 1, errors: [] };
    const stored = await storeLoad(accountId, mailboxId, `upload:${filename}:${buf.length}`, rc, new Date());
    return { stored: stored ? 1 : 0, skipped: stored ? 0 : 1, errors: [] };
  } catch (e) { console.error("[reader]", filename, e); return { stored: 0, skipped: 0, errors: [(e as Error).message] }; }
}

async function readDoc(d: { pdfBase64?: string; text?: string; filename?: string }): Promise<RateCon | null> {
  if (!aiReady()) throw new Error("ANTHROPIC_API_KEY is not set, so the rate con reader is off.");
  return parseRateCon(d);
}
