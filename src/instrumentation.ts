/* Runs once when the server starts. Off Vercel (a laptop, a VPS) nothing else
   would fire the ten-minute job, so we run it in-process. On Vercel the cron in
   vercel.json does it and this stays idle. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || process.env.LOCAL_CRON === "0") return;
  const { runCron } = await import("./lib/cron");
  const { sendQueued, sendLinkedinQueued } = await import("./lib/outreach");
  const tick = async () => { try { await runCron(); } catch (e) { console.error("[cron]", (e as Error).message); } };
  const send = async () => { try { await sendQueued(); await sendLinkedinQueued(); } catch (e) { console.error("[sender]", (e as Error).message); } };
  setTimeout(tick, 60_000);
  setInterval(tick, 10 * 60_000);
  setInterval(send, 60_000);                       // the paced sender: one email per mailbox, spaced 3 to 8 minutes
  console.log("[cron] built-in scheduler on: mail every 10 minutes, sender every minute");
}
