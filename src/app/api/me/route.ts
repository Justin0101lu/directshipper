import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { json, withSession } from "@/lib/api";
import { balance } from "@/lib/tokens";
import { msEnabled } from "@/lib/mail/graph";
import { providersReady } from "@/lib/enrich";
import { aiReady } from "@/lib/ai/client";
import { stripeReady } from "@/lib/stripe";
import { env } from "@/lib/env";
import { queueDepth } from "@/lib/ai/batch";
import { PLANS, type PlanId } from "@/lib/plans";
export const GET = withSession(async (_req, s) => {
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid));
  const mailboxes = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.accountId, s.aid));
  const authorities = await db.select().from(schema.authorities).where(eq(schema.authorities.accountId, s.aid));
  const b = await balance(s.aid);
  return json({
    email: s.email, company: a.company, plan: a.plan, tokens: b, autopilot: a.autopilot, autoPerDay: a.autoPerDay,
    limits: (({ outreach, agreements, inboxes, perDay, name }) => ({ outreach, agreements, inboxes, perDay, planName: name }))(PLANS[a.plan as PlanId] || PLANS.free),
    sending: { emailsPerDay: a.emailsPerDay, gapMin: a.gapMin, gapMax: a.gapMax, callsPerDay: a.callsPerDay },
    authorities: authorities.sort((x, y) => y.loads - x.loads).map((x) => ({ id: x.id, name: x.name, mc: x.mc, loads: x.loads })),
    mailboxes: mailboxes.map((m) => ({ id: m.id, kind: m.kind, address: m.address, senderName: m.senderName, authorityId: m.authorityId, status: m.status, error: m.error, lastSyncAt: m.lastSyncAt, historyDone: m.historyDone, queued: m.queued, readCount: m.readCount })),
    forwardAddress: `loads-${a.forwardToken}@${env.inbound.domain}`,
    batchQueue: await queueDepth(s.aid),
    features: { microsoft: msEnabled(), providers: providersReady(), ai: aiReady(), stripe: stripeReady() },
  });
});
