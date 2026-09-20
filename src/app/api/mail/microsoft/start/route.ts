import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { msAuthUrl, msEnabled } from "@/lib/mail/graph";
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/signin", process.env.APP_URL || "http://localhost:3000"));
  if (!msEnabled()) return new NextResponse("Microsoft sign-in is not configured (MS_CLIENT_ID / MS_CLIENT_SECRET).", { status: 400 });
  return NextResponse.redirect(msAuthUrl(s.aid));
}
