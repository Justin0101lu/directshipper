import { body, fail, json, withSession } from "@/lib/api";
import { reveal, type Field } from "@/lib/enrich";
export const POST = withSession(async (req, s) => {
  const b = await body<{ contactId: string; field: Field }>(req);
  if (!b.contactId || !["name", "linkedin", "email", "phone"].includes(b.field)) return fail("contactId and field required");
  return json(await reveal(s.aid, b.contactId, b.field));
});
