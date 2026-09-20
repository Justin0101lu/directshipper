import { fail, json, withSession } from "@/lib/api";
import { portal, stripeReady } from "@/lib/stripe";
export const POST = withSession(async (_req, s) => { if (!stripeReady()) return fail("Stripe is not configured yet."); return json({ url: await portal(s.aid, s.email) }); });
