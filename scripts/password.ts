/* Reset a user's password from the terminal:  npm run password -- you@example.com NewPassword123 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
(async () => {
  const [email, pw] = process.argv.slice(2);
  if (!email || !pw || pw.length < 8) { console.error("Usage: npm run password -- you@example.com NewPassword   (8+ characters)"); process.exit(1); }
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  if (!u) { console.error(`No account with the email ${email}. Sign up instead.`); process.exit(1); }
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(pw, 10) }).where(eq(schema.users.id, u.id));
  console.log(`Password reset for ${u.email}. Sign in with the new one.`);
  process.exit(0);
})();
