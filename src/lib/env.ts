export const env = {
  appUrl: process.env.APP_URL || "http://localhost:3000",
  secret: process.env.APP_SECRET || "dev-secret-not-for-production",
  model: process.env.CLAUDE_MODEL || "claude-opus-5",              // drafting, triage, the question box (low volume)
  parseModel: process.env.PARSE_MODEL || "claude-haiku-4-5",        // reading rate cons (high volume, cheap)
  hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
  stripe: {
    key: process.env.STRIPE_SECRET_KEY || "",
    webhook: process.env.STRIPE_WEBHOOK_SECRET || "",
    carrier: process.env.STRIPE_PRICE_CARRIER || "",
    fleet: process.env.STRIPE_PRICE_FLEET || "",
  },
  ms: { id: process.env.MS_CLIENT_ID || "", secret: process.env.MS_CLIENT_SECRET || "" },
  inbound: { secret: process.env.INBOUND_SECRET || "", domain: process.env.INBOUND_DOMAIN || "in.directshipper.co" },
  cronSecret: process.env.CRON_SECRET || "",
};
