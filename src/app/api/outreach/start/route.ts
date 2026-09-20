import { body, fail, json, withSession } from "@/lib/api";
import { attachContact, prepareDock } from "@/lib/outreach";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
/* Prepare a dock's sequence (free), optionally attaching a person. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ facilityId?: string; contactId?: string }>(req);
  let facilityId = b.facilityId;
  if (!facilityId && b.contactId) {
    const db = await getDb();
    const [c] = await db.select({ f: schema.contacts.facilityId }).from(schema.contacts).where(eq(schema.contacts.id, b.contactId));
    facilityId = c?.f;
  }
  if (!facilityId) return fail("facilityId or contactId required");
  const seq = await prepareDock(s.aid, facilityId);
  if (b.contactId) await attachContact(s.aid, seq.id, b.contactId);
  return json(seq);
});
