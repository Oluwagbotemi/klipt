import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from the schema (`npm run db:generate`).
// Migrations are applied by scripts/db-migrate.ts, or automatically for local PGlite.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
});
