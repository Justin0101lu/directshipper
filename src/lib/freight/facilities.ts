/* Facility resolution without a geocoder: normalize the street address hard
   enough that "4200 E. Airport Drive, Ste 4" and "4200 EAST AIRPORT DR"
   land on the same key. A geocoder can be added later; the key stays. */

const ABBR: Record<string, string> = {
  street: "st", avenue: "ave", boulevard: "blvd", drive: "dr", road: "rd", lane: "ln", court: "ct", place: "pl", parkway: "pkwy", highway: "hwy",
  north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  building: "bldg", suite: "ste", unit: "unit",
};
const STATES: Record<string, string> = { california: "CA", arizona: "AZ", nevada: "NV", texas: "TX", colorado: "CO", utah: "UT", "new mexico": "NM", oregon: "OR", washington: "WA", idaho: "ID", oklahoma: "OK", kansas: "KS", nebraska: "NE", illinois: "IL", georgia: "GA", florida: "FL", "north carolina": "NC", "south carolina": "SC", tennessee: "TN", ohio: "OH", pennsylvania: "PA", "new jersey": "NJ", "new york": "NY", michigan: "MI", indiana: "IN", wisconsin: "WI", minnesota: "MN", missouri: "MO", arkansas: "AR", louisiana: "LA", mississippi: "MS", alabama: "AL", kentucky: "KY", virginia: "VA", maryland: "MD", iowa: "IA" };

export function normState(s: string | null | undefined) {
  if (!s) return "";
  const t = s.trim();
  if (t.length === 2) return t.toUpperCase();
  return STATES[t.toLowerCase()] || t.toUpperCase().slice(0, 2);
}
export function normCity(s: string | null | undefined) {
  return (s || "").trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function normStreet(s: string | null | undefined) {
  if (!s) return "";
  let t = s.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\b(ste|suite|unit|bldg|building|dock|door|gate)\b\s*[a-z0-9-]*/g, " ");
  t = t.split(" ").map((w) => ABBR[w] || w).join(" ").replace(/\s+/g, " ").trim();
  return t;
}
export function facilityKey(street: string | null | undefined, city: string | null | undefined, state: string | null | undefined, name?: string | null) {
  const st = normStreet(street);
  const c = normCity(city).toLowerCase();
  const s = normState(state);
  if (st) return `${st}|${c}|${s}`;
  /* No street: fall back to name + city so we still group. */
  return `name:${(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${c}|${s}`;
}

const THIRD_PARTY = /lineage|americold|united states cold|us cold|cold storage|logistics|warehous|3pl|distribution services|fulfillment|nfi |kenco|dhl|xpo|ryder|penske|prologis/i;
export function facilityType(name: string | null | undefined, shipper: string | null | undefined) {
  const n = name || "";
  if (THIRD_PARTY.test(n)) return "3pl";
  if (/\b(dc|distribution center|rdc|warehouse|whse)\b/i.test(n)) return "dc";
  if (shipper && n && !n.toLowerCase().includes(shipper.toLowerCase().split(" ")[0])) return "3pl";
  return "shipper";
}
