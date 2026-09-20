/* Cheap pre-filter so we only send likely rate cons to the reader. */
const SUBJECT = /rate\s*con|confirmation|load\s*(tender|#|no|number)|carrier\s*(confirmation|agreement)|tender|dispatch|pickup\s*#?|bol|shipment|freight/i;
const BODY = /rate\s*confirmation|carrier\s*rate|linehaul|total\s*rate|pick\s*up|deliver|mc\s*#?\s*\d{5,}|dot\s*#?\s*\d{5,}|reefer|dry\s*van|flatbed|shipper|consignee|commodity|pallets?/i;

export function looksLikeRateCon(subject: string, text: string, attachmentNames: string[]) {
  const s = subject || "", t = (text || "").slice(0, 6000);
  const pdf = attachmentNames.some((n) => /\.pdf$/i.test(n));
  const subj = SUBJECT.test(s);
  const bodyHits = (t.match(BODY) || []).length;
  const bodyStrong = (t.match(/rate\s*confirmation|carrier\s*rate|linehaul|consignee/gi) || []).length;
  if (pdf && (subj || bodyHits >= 2)) return true;
  if (subj && bodyHits >= 2) return true;
  if (bodyStrong >= 2 && bodyHits >= 5) return true;
  return false;
}
