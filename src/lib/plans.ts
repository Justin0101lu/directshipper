export type PlanId = "free" | "carrier" | "fleet";
export const PLANS: Record<PlanId, {
  id: PlanId; name: string; price: number; monthly: number; extra: number | null;
  outreach: boolean; export: boolean; who: string; perks: string[]; off: string[];
}> = {
  free:    { id: "free", name: "Free", price: 0, monthly: 10, extra: null, outreach: false, export: false,
             who: "Free forever, not a trial",
             perks: ["Inbox connect — full history scan", "Unlimited rate con parsing", "Your full freight profile", "Receivers you already deliver to"],
             off: ["No extra tokens", "No export or outreach sends"] },
  carrier: { id: "carrier", name: "Carrier", price: 39, monthly: 100, extra: 0.5, outreach: true, export: true,
             who: "Owner-operators and small fleets",
             perks: ["Outreach — email sequences on autopilot", "Export to CSV", "Everything in Free, unlimited", "Unlimited users"], off: [] },
  fleet:   { id: "fleet", name: "Fleet", price: 149, monthly: 500, extra: 0.4, outreach: true, export: true,
             who: "Fleets with someone selling",
             perks: ["Everything in Carrier", "Load history import — CSV & scheduled report", "Unlimited users"], off: [] },
};
export const TOKEN_ITEMS = [
  { what: "One lookalike shipper", cost: 1 },
  { what: "Reveal who a contact is — name and job title", cost: 1 },
  { what: "Their LinkedIn profile", cost: 1 },
  { what: "A verified email address", cost: 1 },
  { what: "A direct phone number", cost: 1 },
  { what: "Nothing found", cost: 0 },
];
export const FREE_ITEMS = [
  "Connecting your inbox", "Scanning your whole mail history", "Parsing rate cons and BOLs",
  "Your freight profile and lane rates", "Deadhead analysis", "Receivers you already deliver to",
  "Outreach drafts and follow-ups", "Asking your freight a question", "Export and extra users",
];
