/* List the accounts in this computer's database:  npm run users */
import { getDb, schema } from "../src/db";
(async () => {
  const db = await getDb();
  const rows = await db.select({ email: schema.users.email, created: schema.users.createdAt }).from(schema.users);
  if (!rows.length) console.log("No accounts yet on this computer. Use Sign up.");
  for (const r of rows) console.log(r.email, "· signed up", r.created?.toLocaleDateString?.() ?? "");
  process.exit(0);
})();
