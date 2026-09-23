import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { body, fail, json, withSession } from "@/lib/api";
import { spend, TokenError } from "@/lib/tokens";
import { computeProfile } from "@/lib/freight/profile";
import { FAMILY_INDUSTRIES, revealLookalike } from "@/lib/freight/prospects";
import { stateName } from "@/lib/freight/states";
import { PEOPLE_ORDER } from "@/lib/enrich";

const SIZE = 20;
/* Cold prospects from a company database, for carriers the network cannot serve yet.
   One token per company, charged only for what comes back. */
export const POST = withSession(async (req, s) => {
  const b = await body<{ state?: string; family?: string; estimate?: boolean }>(req);
  const prof = await computeProfile(s.aid);
  const family = b.family || (prof.families[0]?.name.startsWith("Frozen") ? "frozen" : prof.families[0]?.name.startsWith("Fresh") ? "produce" : "dry");
  const industries = FAMILY_INDUSTRIES[family] || FAMILY_INDUSTRIES.dry;
  const st = (b.state || prof.home?.split(",").pop()?.trim() || "").toUpperCase().slice(0, 2);
  const stName = stateName(st);
  if (!stName) return fail("Pick a state (two letters).");
  if (b.estimate) return json({ count: SIZE, tokens: SIZE, industries, state: st });
  const p = PEOPLE_ORDER.find((x) => x.ready() && x.findCompanies);
  if (!p) return fail("Company search needs a People Data Labs key on the server.");
  const db = await getDb();
  const found = (await p.findCompanies!(industries, stName, SIZE)) || [];
  const fresh: { name: string; website: string | null; city: string | null; state: string | null; industry: string | null; employees: number | null }[] = [];
  for (const c of found) {
    const key = `co:${(c.website || c.name).toLowerCase()}`;
    const [existing] = await db.select().from(schema.facilities).where(eq(schema.facilities.key, key));
    const [mine] = existing ? await db.select().from(schema.prospects).where(eq(schema.prospects.facilityId, existing.id)) : [];
    if (mine && mine.accountId === s.aid) continue;        // already theirs
    fresh.push(c);
  }
  if (!fresh.length) return fail("Nothing new came back for that search. Try another state or kind of freight.");
  try { await spend(s.aid, fresh.length, `${fresh.length} companies from a database — ${industries[0]} in ${st}`); }
  catch (e) { if (e instanceof TokenError) return fail(e.message, 402); throw e; }
  let n = 0;
  for (const c of fresh) {
    const key = `co:${(c.website || c.name).toLowerCase()}`;
    let [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.key, key));
    if (!f) [f] = await db.insert(schema.facilities).values({ key, name: c.name, city: c.city || "", state: (c.state && c.state.length === 2 ? c.state : st), type: "company", shipper: c.name, domain: c.website, companyKey: c.website || c.name.toLowerCase(), note: `${c.industry || "Company"}${c.employees ? `, about ${c.employees.toLocaleString()} employees` : ""}` }).returning();
    await revealLookalike(s.aid, f.id); n++;
  }
  return json({ found: n, tokens: n });
});
