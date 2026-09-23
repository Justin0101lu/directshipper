import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
import { hostedLink, liEnabled } from "@/lib/linkedin/unipile";
import { PLANS, type PlanId } from "@/lib/plans";
/* Start connecting the LinkedIn account of the person a mailbox speaks for. Returns Unipile's hosted login page. */
export const POST = withSession(async (req, s) => {
  if (!liEnabled()) return fail("LinkedIn automation is not configured on the server yet (Unipile keys).");
  const b = await body<{ mailboxId: string }>(req);
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, s.aid));
  if (!PLANS[a.plan as PlanId].outreach) return fail("LinkedIn automation is on Carrier and up.", 402);
  const [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.id, b.mailboxId), eq(schema.mailboxes.accountId, s.aid)));
  if (!mb) return fail("No such mailbox.", 404);
  try { return json({ url: await hostedLink(mb.id) }); } catch (e) { return fail(`Could not reach Unipile: ${(e as Error).message}`); }
});
