import { eq, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { syncImapMailbox } from "./mail/imap";
import { syncGraphMailbox } from "./mail/graph";
import { runDueSteps, prepareTop, autopilotTick, discoverTop, sendQueued } from "./outreach";
import { collectBatches, submitBatches } from "./ai/batch";

export async function runCron() {
  const db = await getDb();
  const boxes = await db.select().from(schema.mailboxes).where(or(eq(schema.mailboxes.kind, "gmail_imap"), eq(schema.mailboxes.kind, "microsoft")));
  const mail: Record<string, unknown> = {};
  const started = Date.now();
  for (const mb of boxes) {
    if (Date.now() - started > 240_000) break;           // stay inside a serverless window
    try { mail[mb.id] = mb.kind === "microsoft" ? await syncGraphMailbox(mb.id, { budget: 40 }) : await syncImapMailbox(mb.id, { budget: 60 }); }
    catch (e) { mail[mb.id] = { error: (e as Error).message }; }
  }
  let batch: unknown = null;
  try { const collected = await collectBatches(); const submitted = await submitBatches(); batch = { ...collected, ...submitted }; }
  catch (e) { batch = { error: (e as Error).message }; }
  const outreach = await runDueSteps();
  /* Pre-write sequences for the warmest docks, a few per account per tick. */
  const drafted: Record<string, number> = {};
  const accts = await db.select({ id: schema.accounts.id }).from(schema.accounts);
  const agent: Record<string, number> = {};
  for (const a of accts) {
    if (Date.now() - started > 270_000) break;
    try { await discoverTop(a.id, 5); } catch { /* next tick */ }
    try { const n = await prepareTop(a.id, 2); if (n) drafted[a.id] = n; } catch { /* next tick */ }
    try { const r = await autopilotTick(a.id); if (r.started) agent[a.id] = r.started; } catch { /* next tick */ }
  }
  const sender = await sendQueued();
  return { mailboxes: boxes.length, mail, batch, outreach, drafted, agent, sender };
}
