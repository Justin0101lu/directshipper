/* Run the same job Vercel cron runs, from a shell or a system cron: npm run cron */
import { runCron } from "../src/lib/cron";
runCron().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
