import type { Provider } from "./types";
const key = () => process.env.PEOPLEDATALABS_API_KEY || "";
const H = () => ({ "x-api-key": key(), "content-type": "application/json" });

export const pdl: Provider = {
  id: "peopledatalabs",
  ready: () => !!key(),
  async findDomain(company) {
    const r = await fetch(`https://api.peopledatalabs.com/v5/company/enrich?name=${encodeURIComponent(company)}`, { headers: H() });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.website as string) || null;
  },
  async findPeople(company, domain, titles, size, near) {
    const esc = (s: string) => s.replace(/'/g, "");
    const where = near ? ` AND location_region='${esc(near.stateName)}'` : "";
    const sqlq = `SELECT * FROM person WHERE ${domain ? `job_company_website='${esc(domain)}'` : `job_company_name='${esc(company)}'`} AND (${titles.map((t) => `job_title LIKE '%${esc(t)}%'`).join(" OR ")})${where}`;
    const r = await fetch("https://api.peopledatalabs.com/v5/person/search", { method: "POST", headers: H(), body: JSON.stringify({ sql: sqlq, size, pretty: false }) });
    if (!r.ok) return null;
    const j = await r.json();
    const rows = (j?.data || []) as Record<string, unknown>[];
    return rows.map((p) => ({
      name: p.full_name ? String(p.full_name).replace(/\b\w/g, (c: string) => c.toUpperCase()) : null,
      title: (p.job_title as string) ? String(p.job_title).replace(/\b\w/g, (c: string) => c.toUpperCase()) : null,
      linkedin: p.linkedin_url ? `https://${p.linkedin_url}` : null,
      email: (p.work_email as string) || null,
      phone: Array.isArray(p.phone_numbers) && p.phone_numbers[0] ? String(p.phone_numbers[0]) : (p.mobile_phone as string) || null,
    }));
  },
  async findCompanies(industries, stateName, size) {
    const esc = (s: string) => s.replace(/'/g, "");
    const sqlq = `SELECT * FROM company WHERE location.region='${esc(stateName)}' AND location.country='united states' AND (${industries.map((i) => `industry='${esc(i)}'`).join(" OR ")}) AND employee_count>=50`;
    const r = await fetch("https://api.peopledatalabs.com/v5/company/search", { method: "POST", headers: H(), body: JSON.stringify({ sql: sqlq, size, pretty: false }) });
    if (!r.ok) return null;
    const j = await r.json();
    const rows = (j?.data || []) as Record<string, unknown>[];
    const cap = (s: unknown) => (s ? String(s).replace(/\b\w/g, (c) => c.toUpperCase()) : null);
    return rows.map((c) => { const loc = (c.location || {}) as Record<string, unknown>; return {
      name: cap(c.display_name || c.name) || "Unknown company", website: (c.website as string) || null,
      city: cap(loc.locality), state: cap(loc.region), industry: cap(c.industry), employees: typeof c.employee_count === "number" ? c.employee_count : null,
    }; });
  },
  async findEmail(name, domain) {
    const r = await fetch("https://api.peopledatalabs.com/v5/person/enrich?" + new URLSearchParams({ name, company: domain, min_likelihood: "6" }), { headers: H() });
    if (!r.ok) return null;
    const j = await r.json();
    return (j?.data?.work_email as string) || null;
  },
  async findPhone(name, company, linkedin) {
    const q: Record<string, string> = linkedin ? { profile: linkedin } : { name, company };
    const r = await fetch("https://api.peopledatalabs.com/v5/person/enrich?" + new URLSearchParams({ ...q, min_likelihood: "6" }), { headers: H() });
    if (!r.ok) return null;
    const j = await r.json();
    const ph = j?.data?.mobile_phone || j?.data?.phone_numbers?.[0];
    return ph ? String(ph) : null;
  },
};
