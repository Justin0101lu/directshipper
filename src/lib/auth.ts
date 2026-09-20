import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";

const COOKIE = "ds_session";
const secret = () => new TextEncoder().encode(env.secret);

export type Session = { uid: string; aid: string; email: string };

export async function createSession(s: Session) {
  const jwt = await new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v) return null;
  try {
    const { payload } = await jwtVerify(v, secret());
    return { uid: String(payload.uid), aid: String(payload.aid), email: String(payload.email) };
  } catch { return null; }
}
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  return s;
}

export async function signup(company: string, email: string, password: string, mc?: string) {
  const db = await getDb();
  email = email.trim().toLowerCase();
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing.length) throw new Error("An account with that email already exists. Sign in instead.");
  const [acct] = await db.insert(schema.accounts).values({ company: company.trim(), mc: mc?.trim() || null }).returning();
  const [user] = await db.insert(schema.users).values({ accountId: acct.id, email, passwordHash: await bcrypt.hash(password, 10) }).returning();
  await db.insert(schema.ledger).values({ accountId: acct.id, delta: 20, what: "Welcome tokens" });
  await createSession({ uid: user.id, aid: acct.id, email });
  return { user, acct };
}
export async function signin(email: string, password: string) {
  const db = await getDb();
  email = email.trim().toLowerCase();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new Error("Wrong email or password.");
  await createSession({ uid: user.id, aid: user.accountId, email });
  return user;
}
