import { eq, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { syncImapMailbox } from "./mail/imap";
import { syncGraphMailbox } from "./mail/graph";
import { runDueSteps } from "./outreach";

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
  const outreach = await runDueSteps();
  return { mailboxes: boxes.length, mail, outreach };
}
