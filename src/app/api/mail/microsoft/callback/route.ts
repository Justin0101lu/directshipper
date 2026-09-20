import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { seal } from "@/lib/crypto";
import { env } from "@/lib/env";
import { msExchangeCode, msMe, syncGraphMailbox } from "@/lib/mail/graph";
export async function GET(req: Request) {
  const s = await getSession();
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  if (!s || !code || u.searchParams.get("state") !== s.aid) return NextResponse.redirect(`${env.appUrl}/onboard?err=microsoft`);
  try {
    const t = await msExchangeCode(code);
    const address = await msMe(t.access_token);
    const db = await getDb();
    const [mb] = await db.insert(schema.mailboxes).values({ accountId: s.aid, kind: "microsoft", address, secret: seal(t.refresh_token) }).returning();
    syncGraphMailbox(mb.id, { budget: 25 }).catch(() => {});
    return NextResponse.redirect(`${env.appUrl}/app?connected=outlook`);
  } catch { return NextResponse.redirect(`${env.appUrl}/onboard?err=microsoft`); }
}
