import { signup } from "@/lib/auth";
import { body, fail, json } from "@/lib/api";
export async function POST(req: Request) {
  const b = await body<{ company: string; email: string; password: string; mc?: string }>(req);
  if (!b.company || !b.email || !b.password) return fail("Company, email and a password are required.");
  if (b.password.length < 8) return fail("Use a password of at least 8 characters.");
  try { await signup(b.company, b.email, b.password, b.mc); return json({ ok: true }); }
  catch (e) { return fail((e as Error).message); }
}
