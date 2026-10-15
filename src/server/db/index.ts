import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/*
 * Database connection.
 *
 * - DATABASE_URL set (production, e.g. Neon): node-postgres pool. Run
 *   `npm run db:migrate` as a deploy step.
 * - DATABASE_URL unset (local development): embedded Postgres via PGlite,
 *   stored in PGLITE_DATA_DIR (default .data/pglite) and migrated
 *   automatically on first connection. PGlite is single-process: stop the dev
 *   server before running db scripts against the same directory.
 */

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

async function connect(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    return drizzle(url, { schema }) as unknown as Database;
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PGLITE_IN_PRODUCTION) {
    throw new Error("DATABASE_URL must be set in production.");
  }
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  return createPgliteDatabase(dataDir, { migrate: true });
}

/** Creates a PGlite-backed database. Pass `memory://` for an in-memory instance (tests). */
export async function createPgliteDatabase(
  dataDir: string,
  { migrate }: { migrate: boolean },
): Promise<Database> {
  const [{ PGlite }, { drizzle }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  if (migrate) {
    const { migrate: runMigrations } = await import("drizzle-orm/pglite/migrator");
    await runMigrations(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  return db as unknown as Database;
}

// One connection per server process, surviving dev hot reloads.
const globalForDb = globalThis as typeof globalThis & { __kliptDb?: Promise<Database> };

export function getDb(): Promise<Database> {
  globalForDb.__kliptDb ??= connect().catch((error) => {
    globalForDb.__kliptDb = undefined;
    throw error;
  });
  return globalForDb.__kliptDb;
}

export { schema };
