import type { Provider } from "./types";
/* Further waterfall stops. Each is a small adapter; add the key and it joins the order. */
export const leadmagic: Provider = {
  id: "leadmagic", ready: () => !!process.env.LEADMAGIC_API_KEY,
  async findEmail(name, domain) {
    const [first, ...rest] = name.split(" ");
    const r = await fetch("https://api.leadmagic.io/email-finder", { method: "POST", headers: { "X-API-Key": process.env.LEADMAGIC_API_KEY!, "content-type": "application/json" }, body: JSON.stringify({ first_name: first, last_name: rest.join(" "), domain }) });
    if (!r.ok) return null; const j = await r.json();
    return j?.status === "valid" && j.email ? j.email : null;
  },
  async findPhone(_name, _company, linkedin) {
    if (!linkedin) return null;
    const r = await fetch("https://api.leadmagic.io/mobile-finder", { method: "POST", headers: { "X-API-Key": process.env.LEADMAGIC_API_KEY!, "content-type": "application/json" }, body: JSON.stringify({ profile_url: linkedin }) });
    if (!r.ok) return null; const j = await r.json();
    return j?.mobile_number || null;
  },
};
export const prospeo: Provider = {
  id: "prospeo", ready: () => !!process.env.PROSPEO_API_KEY,
  async findEmail(name, domain) {
    const [first, ...rest] = name.split(" ");
    const r = await fetch("https://api.prospeo.io/email-finder", { method: "POST", headers: { "X-KEY": process.env.PROSPEO_API_KEY!, "content-type": "application/json" }, body: JSON.stringify({ first_name: first, last_name: rest.join(" "), company: domain }) });
    if (!r.ok) return null; const j = await r.json();
    return !j?.error && j?.response?.email_status === "VALID" ? j.response.email : null;
  },
};
export const wiza: Provider = {
  id: "wiza", ready: () => !!process.env.WIZA_API_KEY,
  async findEmail(name, domain) {
    const r = await fetch("https://wiza.co/api/individual_reveals", { method: "POST", headers: { authorization: `Bearer ${process.env.WIZA_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ individual_reveal: { full_name: name, company_domain: domain }, enrichment_level: "partial" }) });
    if (!r.ok) return null; const j = await r.json();
    const e = j?.data?.email; return e && j?.data?.email_status === "valid" ? e : null;
  },
};
