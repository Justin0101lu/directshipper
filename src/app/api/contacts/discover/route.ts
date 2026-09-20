import { body, fail, json, withSession } from "@/lib/api";
import { discover } from "@/lib/enrich";
/* Free: who is in a freight role at this warehouse's company. Titles show; names cost a token. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ facilityId: string }>(req);
  if (!b.facilityId) return fail("facilityId required");
  const r = await discover(b.facilityId);
  return json({ count: r.people.length, cached: r.cached, accountId: s.aid });
});
