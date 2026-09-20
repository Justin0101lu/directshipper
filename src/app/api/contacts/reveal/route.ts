import { body, fail, json, withSession } from "@/lib/api";
import { reveal, type Field } from "@/lib/enrich";
export const POST = withSession(async (req, s) => {
  const b = await body<{ facilityId: string; field: Field }>(req);
  if (!b.facilityId || !["name", "linkedin", "email", "phone"].includes(b.field)) return fail("facilityId and field required");
  return json(await reveal(s.aid, b.facilityId, b.field));
});
