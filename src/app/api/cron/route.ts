import { runCron } from "@/lib/cron";
import { env } from "@/lib/env";
/* Every 10 minutes on Vercel (vercel.json). Reads new mail, sends due touches, checks for replies. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (env.cronSecret && auth !== `Bearer ${env.cronSecret}`) return new Response("no", { status: 401 });
  return Response.json(await runCron());
}
