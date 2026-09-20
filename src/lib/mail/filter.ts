/* Free gates in front of the reader. Nothing here calls a model.

   strict   (default) the subject must look like a rate con / tender.
   thorough subject OR strong body signals. Wider, costs more. */

export const SUBJECT_STRICT = /rate\s*con(f|firmation)?\b|rate\s*confirm|load\s*con(f|firmation)?\b|carrier\s*(con(f|firmation)?|agreement|rate)|\btender(ed)?\b|dispatch\s*(sheet|confirmation|#)|\bload\s*(#|no\.?|number|id)\s*[:#]?\s*\w*\d|\bbol\b|bill\s*of\s*lading|pickup\s*(#|number)|confirmation\s*(#|number|for\s+load)|\bpo\s*#?\s*\d{4,}.*(load|pickup|deliver)/i;
const SUBJECT_LOOSE = /rate|confirmation|load|tender|dispatch|pickup|shipment|freight|bol/i;
const BODY = /rate\s*confirmation|carrier\s*rate|linehaul|total\s*rate|pick\s*up|deliver|mc\s*#?\s*\d{5,}|dot\s*#?\s*\d{5,}|reefer|dry\s*van|flatbed|shipper|consignee|commodity|pallets?/gi;
const NOISE = /unsubscribe|newsletter|webinar|invoice\s*(#|no|number)|remittance|payment\s+advice|statement|quickpay|factoring|detention\s+request|lumper/i;

export const scanMode = () => (process.env.SCAN_MODE === "thorough" ? "thorough" : "strict");

/* Decide from the subject alone, before the body is even fetched. */
export function subjectPasses(subject: string) {
  const s = subject || "";
  if (NOISE.test(s) && !/rate\s*con/i.test(s)) return false;
  return scanMode() === "strict" ? SUBJECT_STRICT.test(s) : SUBJECT_LOOSE.test(s);
}

export function looksLikeRateCon(subject: string, text: string, attachmentNames: string[]) {
  const s = subject || "", t = (text || "").slice(0, 6000);
  if (NOISE.test(s + " " + t.slice(0, 1500)) && !/rate\s*con/i.test(s)) return false;
  const pdf = attachmentNames.some((n) => /\.pdf$/i.test(n));
  if (scanMode() === "strict") return SUBJECT_STRICT.test(s) && (pdf || (t.match(BODY) || []).length >= 2);
  const bodyHits = (t.match(BODY) || []).length;
  const bodyStrong = (t.match(/rate\s*confirmation|carrier\s*rate|linehaul|consignee/gi) || []).length;
  if (pdf && (SUBJECT_LOOSE.test(s) || bodyHits >= 2)) return true;
  if (SUBJECT_LOOSE.test(s) && bodyHits >= 3) return true;
  if (bodyStrong >= 2 && bodyHits >= 5) return true;
  return false;
}
