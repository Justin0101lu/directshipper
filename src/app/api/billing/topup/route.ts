import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
import { savedCard, stripeReady } from "@/lib/stripe";
/* Opt in to auto top-up: when the balance drops under the floor, buy the small pack on the saved card. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ on: boolean }>(req);
  const db = await getDb();
  if (b.on) {
    if (!stripeReady()) return fail("Stripe is not configured yet.");
    if (!(await savedCard(s.aid))) return fail("No card on file yet. Buy any pack once and the card is kept for top-ups.");
  }
  await db.update(schema.accounts).set({ autoTopup: !!b.on }).where(eq(schema.accounts.id, s.aid));
  return json({ ok: true, on: !!b.on });
});
