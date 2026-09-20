/* Pricing: a flat monthly fee that includes a bundle of tokens, then packs of extra
   tokens at the plan's rate. Tokens buy data we had to go out and find; AI is free.
   Included tokens reset on the billing date. Purchased tokens never expire. */
export type PlanId = "free" | "carrier" | "fleet" | "enterprise";
export const PLANS: Record<PlanId, {
  id: PlanId; name: string; price: number;
  monthly: number;        // tokens included each billing month (Free: a one-time welcome grant instead)
  extra: number;          // price of one extra token, in dollars, when bought as a pack
  outreach: boolean;      // autopilot may send
  export: boolean;
  agreements: boolean;    // may upload broker agreements to narrow holds
  inboxes: number;        // sending inboxes (Gmail / Outlook) allowed
  perDay: number;         // ceiling on new shippers a day in Send mode
  who: string; perks: string[]; off: string[];
}> = {
  free: { id: "free", name: "Free", price: 0, monthly: 0, extra: 0.5, outreach: false, export: false, agreements: false, inboxes: 1, perDay: 0,
    who: "Free forever, not a trial",
    perks: ["Connect one inbox or upload rate cons — full history scan", "Every shipper and receiver on your loads", "Who books freight at your busiest warehouses, by title", "Your companies, by MC", "Ask your freight", "Outreach drafts you can copy", "10 welcome tokens to reveal people"],
    off: ["Autopilot does not send", "No broker agreement upload"] },
  carrier: { id: "carrier", name: "Carrier", price: 99, monthly: 200, extra: 0.4, outreach: true, export: true, agreements: true, inboxes: 1, perDay: 3,
    who: "1 to 20 trucks, nobody selling",
    perks: ["The right person at every warehouse — the one who books freight, with a verified email", "Autopilot works 3 new shippers a day, the safe pace for one inbox", "1 sending inbox", "Lookalike shippers", "Broker agreement upload to clear holds", "Export to CSV", "Everything in Free"], off: [] },
  fleet: { id: "fleet", name: "Fleet", price: 299, monthly: 600, extra: 0.3, outreach: true, export: true, agreements: true, inboxes: 5, perDay: 10,
    who: "20 to 100 trucks",
    perks: ["Everything in Carrier", "Autopilot works 10 new shippers a day across your inboxes", "Up to 5 sending inboxes, each with its own company", "Load history import — CSV & scheduled report", "Unlimited users"], off: [] },
  enterprise: { id: "enterprise", name: "Enterprise", price: 799, monthly: 2000, extra: 0.25, outreach: true, export: true, agreements: true, inboxes: 99, perDay: 50,
    who: "100+ trucks, several authorities",
    perks: ["Everything in Fleet", "No pace limit, unlimited sending inboxes", "Priority parsing", "An onboarding call, only if you want one"], off: [] },
};
export const WELCOME_TOKENS = 10;          // one-time, on signup, never expire
export const PACKS = [50, 200, 1000];      // pack sizes; price = size × plan.extra
export const TOPUP_PACK = 50;              // the pack auto top-up buys
export const TOPUP_BELOW = 10;             // auto top-up fires when the balance drops under this
export const packPrice = (plan: PlanId, n: number) => Math.round(n * PLANS[plan].extra * 100) / 100;

/* What a token buys. A reveal of who someone is covers name, title and LinkedIn together. */
export const REVEAL_COST = { name: 1, linkedin: 0, email: 1, phone: 3 } as const;
export const TOKEN_ITEMS = [
  { what: "Who they are: name, title and LinkedIn, together", cost: 1 },
  { what: "A verified email address", cost: 1 },
  { what: "A direct phone number", cost: 3 },
  { what: "One lookalike shipper", cost: 1 },
  { what: "Nothing found, or the email bounces", cost: 0, note: "refunded" },
];
export const FREE_ITEMS = [
  "Connecting your inbox", "Scanning your whole mail history", "Reading rate cons and tenders",
  "Your freight profile and lane rates", "Your companies, by MC", "Receivers you already deliver to",
  "Outreach drafts, follow-ups and every email sent", "Asking your freight a question", "Extra users",
];
