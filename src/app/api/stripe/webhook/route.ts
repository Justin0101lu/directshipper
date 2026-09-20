import { handleWebhook, stripeReady } from "@/lib/stripe";
export async function POST(req: Request) {
  if (!stripeReady()) return new Response("stripe off", { status: 400 });
  const sig = req.headers.get("stripe-signature") || "";
  try { const t = await handleWebhook(await req.text(), sig); return Response.json({ received: t }); }
  catch (e) { return new Response(`Webhook error: ${(e as Error).message}`, { status: 400 }); }
}
