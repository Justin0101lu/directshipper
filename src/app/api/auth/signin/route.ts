import { signin } from "@/lib/auth";
import { body, fail, json } from "@/lib/api";
export async function POST(req: Request) {
  const b = await body<{ email: string; password: string }>(req);
  try { await signin(b.email || "", b.password || ""); return json({ ok: true }); }
  catch (e) { return fail((e as Error).message, 401); }
}
