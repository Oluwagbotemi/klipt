/**
 * Applies pending SQL migrations from ./drizzle.
 * Uses DATABASE_URL when set; otherwise the local PGlite directory.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const db = drizzle(url);
    await migrate(db, { migrationsFolder });
    await db.$client.end();
    console.log("Migrations applied to DATABASE_URL.");
    return;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
  console.log(`Migrations applied to local PGlite at ${dataDir}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
