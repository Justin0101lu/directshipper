"use client";
/* Tiny fetch wrapper. Every API error is {error, code?}. */
export class ApiError extends Error { constructor(msg: string, public status: number, public code?: string) { super(msg); } }
export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  let body = init?.body;
  if (init?.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
  const r = await fetch(path, { ...init, body, headers: { ...headers, ...(init?.headers as Record<string, string>) } });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new ApiError((data && data.error) || String(data) || r.statusText, r.status, data?.code);
  return data as T;
}
export const tok = (n: number) => `${n} token${n === 1 ? "" : "s"}`;
