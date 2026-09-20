import type { Provider } from "./types";
const key = () => process.env.FINDYMAIL_API_KEY || "";
export const findymail: Provider = {
  id: "findymail",
  ready: () => !!key(),
  async findEmail(name, domain) {
    const r = await fetch("https://app.findymail.com/api/search/name", {
      method: "POST", headers: { authorization: `Bearer ${key()}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ name, domain }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const email = j?.contact?.email as string | undefined;
    return email || null;
  },
};
