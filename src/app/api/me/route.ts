import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { balance } from "@/lib/tokens";
import { msEnabled } from "@/lib/mail/graph";
import { providersReady } from "@/lib/enrich";
import { aiReady } from "@/lib/ai/client";
import { stripeReady } from "@/lib/stripe";
import { env } from "@/lib/env";
export const GET = withSession(async (_req, s) => {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid));
  const mailboxes = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.accountId, s.aid));
  const b = await balance(s.aid);
  return json({
    email: s.email, company: a.company, plan: a.plan, tokens: b,
    mailboxes: mailboxes.map((m) => ({ id: m.id, kind: m.kind, address: m.address, status: m.status, error: m.error, lastSyncAt: m.lastSyncAt, historyDone: m.historyDone })),
    forwardAddress: `loads-${a.forwardToken}@${env.inbound.domain}`,
    features: { microsoft: msEnabled(), providers: providersReady(), ai: aiReady(), stripe: stripeReady() },
  });
});
