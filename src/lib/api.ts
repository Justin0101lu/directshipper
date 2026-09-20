import { NextResponse } from "next/server";
import { getSession, type Session } from "./auth";
import { TokenError } from "./tokens";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error: message, ...extra }, { status });

/* Every app route runs inside this: session required, errors turned into JSON. */
export function withSession(handler: (req: Request, s: Session, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const s = await getSession();
    if (!s) return fail("Sign in first.", 401);
    try { return await handler(req, s, ctx); }
    catch (e) {
      if (e instanceof TokenError) return fail(e.message, 402, { code: e.code });
      const msg = (e as Error).message || "Something went wrong.";
      return fail(msg, 400);
    }
  };
}
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
