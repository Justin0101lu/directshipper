import { env } from "@/lib/env";

/* LinkedIn through Unipile. The carrier connects their own LinkedIn once (hosted
   login page, no password stored here). Invites and messages then go out on that
   account, paced by the limits under Settings → Sources. LinkedIn restricts
   accounts that move too fast; the caps are the product, not a nuisance. */

export const liEnabled = () => !!(env.unipile.dsn && env.unipile.key && env.unipile.secret);

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${env.unipile.dsn}/api/v1${path}`, { ...init, headers: { accept: "application/json", "X-API-KEY": env.unipile.key, ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(init.headers || {}) } });
  const text = await r.text();
  let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) { const d = data as { title?: string; detail?: string; message?: string } | null; throw new Error(d?.detail || d?.title || d?.message || `Unipile ${r.status}`); }
  return data as T;
}

/* A one-time login page for this mailbox's person. Unipile calls notify_url when it is done. */
export async function hostedLink(mailboxId: string) {
  const expires = new Date(Date.now() + 60 * 60_000).toISOString();
  const r = await call<{ url: string }>("/hosted/accounts/link", { method: "POST", body: JSON.stringify({
    type: "create", providers: ["LINKEDIN"], api_url: env.unipile.dsn, expiresOn: expires, name: mailboxId,
    notify_url: `${env.appUrl}/api/linkedin/notify/${env.unipile.secret}`,
    success_redirect_url: `${env.appUrl}/app/settings/sources?li=ok`, failure_redirect_url: `${env.appUrl}/app/settings/sources?li=err`,
  }) });
  return r.url;
}

export async function accountName(accountId: string) {
  try { const a = await call<{ name?: string; connection_params?: { im?: { username?: string } } }>(`/accounts/${accountId}`); return a.connection_params?.im?.username || a.name || null; } catch { return null; }
}

export async function disconnect(accountId: string) {
  try { await call(`/accounts/${accountId}`, { method: "DELETE" }); } catch { /* already gone */ }
}

/* Make sure Unipile tells us about incoming messages, so a LinkedIn reply stops the sequence. */
export async function ensureMessageWebhook() {
  const url = `${env.appUrl}/api/linkedin/webhook/${env.unipile.secret}`;
  const list = await call<{ items?: { request_url?: string }[] }>("/webhooks").catch(() => ({ items: [] }));
  if ((list.items || []).some((w) => w.request_url === url)) return;
  await call("/webhooks", { method: "POST", body: JSON.stringify({ request_url: url, source: "messaging", name: "Direct Shipper replies", format: "json" }) });
}

export type LiProfile = { provider_id: string; public_identifier?: string; network_distance?: string; is_open_profile?: boolean; first_name?: string };
export const publicIdFrom = (url: string) => { const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i); return m ? decodeURIComponent(m[1]) : null; };

export async function profile(accountId: string, identifier: string) {
  return call<LiProfile>(`/users/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(accountId)}`);
}

export async function invite(accountId: string, providerId: string, message: string) {
  return call("/users/invite", { method: "POST", body: JSON.stringify({ account_id: accountId, provider_id: providerId, ...(message ? { message } : {}) }) });
}

export async function message(accountId: string, providerId: string, text: string, inmail = false) {
  const fd = new FormData();
  fd.set("account_id", accountId); fd.set("attendees_ids", providerId); fd.set("text", text);
  if (inmail) fd.set("inmail", "true");
  return call("/chats", { method: "POST", body: fd });
}
