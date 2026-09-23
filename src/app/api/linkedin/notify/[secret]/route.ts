import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { accountName, ensureMessageWebhook } from "@/lib/linkedin/unipile";
/* Unipile calls this when a hosted login finishes. `name` is the mailbox id we passed. */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!env.unipile.secret || secret !== env.unipile.secret) return new Response("no", { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { status?: string; account_id?: string; name?: string };
  if (!b.name || !b.account_id) return Response.json({ ok: false });
  const db = await getDb();
  const [mb] = await db.select().from(schema.mailboxes).where(eq(schema.mailboxes.id, b.name));
  if (!mb) return Response.json({ ok: false });
  if (b.status === "CREATION_SUCCESS" || b.status === "RECONNECTED") {
    await db.update(schema.mailboxes).set({ linkedinAccountId: b.account_id, linkedinStatus: "ok", linkedinName: await accountName(b.account_id) }).where(eq(schema.mailboxes.id, mb.id));
    ensureMessageWebhook().catch((e) => console.error("[linkedin] webhook", (e as Error).message));
  } else {
    await db.update(schema.mailboxes).set({ linkedinStatus: "error" }).where(eq(schema.mailboxes.id, mb.id));
  }
  return Response.json({ ok: true });
}
