import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

/* One database module for both worlds:
   - DATABASE_URL set  -> Postgres (Neon, Supabase, RDS, anything)
   - DATABASE_URL unset -> embedded Postgres (PGlite) on disk. Local only. */

type Db = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

const g = globalThis as unknown as { __ds_db?: Promise<Db>; __ds_migrated?: boolean };

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzlePg(client, { schema });
    if (!g.__ds_migrated) {
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      await migrate(db, { migrationsFolder: "./drizzle" });
      g.__ds_migrated = true;
    }
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("node:fs");
  const dir = process.env.PGLITE_DIR || "./.data/pg";
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  if (!g.__ds_migrated) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
    g.__ds_migrated = true;
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__ds_db) g.__ds_db = open();
  return g.__ds_db;
}

export { schema };
export type { Db };
