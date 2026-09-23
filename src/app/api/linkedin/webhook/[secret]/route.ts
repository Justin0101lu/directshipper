import { env } from "@/lib/env";
import { linkedinReply } from "@/lib/outreach";
/* Unipile messaging webhook: a new LinkedIn message from someone we wrote to stops their sequence. */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!env.unipile.secret || secret !== env.unipile.secret) return new Response("no", { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { event?: string; sender?: { attendee_provider_id?: string }; message?: string; timestamp?: string; is_sender?: number | boolean };
  if (b.event && b.event !== "message_received") return Response.json({ ok: true });
  const from = b.sender?.attendee_provider_id;
  if (!from || !b.message) return Response.json({ ok: true });
  const n = await linkedinReply(from, b.message, b.timestamp ? new Date(b.timestamp) : new Date());
  return Response.json({ ok: true, stopped: n });
}
