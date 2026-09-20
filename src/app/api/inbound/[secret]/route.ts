import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { ingestParts } from "@/lib/mail/ingest";
/* Forwarding address. Postmark (or any inbound provider posting the same JSON) hits this URL.
   Routed to the account by the loads-<token>@ address. */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!env.inbound.secret || secret !== env.inbound.secret) return new Response("no", { status: 403 });
  const m = await req.json();
  const to: string = (m.ToFull?.[0]?.Email || m.To || "").toLowerCase();
  const token = to.match(/loads-([a-z0-9]+)@/)?.[1];
  if (!token) return new Response("unknown recipient", { status: 200 });
  const db = await getDb();
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.forwardToken, token));
  if (!a) return new Response("unknown account", { status: 200 });
  let [mb] = await db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.accountId, a.id), eq(schema.mailboxes.kind, "forward")));
  if (!mb) [mb] = await db.insert(schema.mailboxes).values({ accountId: a.id, kind: "forward", address: to }).returning();
  const pdfs = ((m.Attachments || []) as { Name: string; Content: string; ContentType: string }[])
    .filter((x) => x.ContentType === "application/pdf" || /\.pdf$/i.test(x.Name)).map((x) => ({ name: x.Name, buf: Buffer.from(x.Content, "base64") }));
  const text = m.TextBody || String(m.HtmlBody || "").replace(/<[^>]+>/g, " ");
  const r = await ingestParts(a.id, mb.id, { subject: m.Subject || "", from: m.From || null, text, pdfs, ref: `fwd:${m.MessageID || Date.now()}` });
  await db.update(schema.mailboxes).set({ lastSyncAt: new Date() }).where(eq(schema.mailboxes.id, mb.id));
  return Response.json(r);
}
