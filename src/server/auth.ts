import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, type Database } from "@/server/db";
import { accounts, sessions, users, verifications } from "@/server/db/schema";

/*
 * Authentication (Better Auth, email + password). Sessions are stored in our
 * database. Requires BETTER_AUTH_SECRET in production; BETTER_AUTH_URL should
 * be the public origin of the app.
 */

export function createAuth(db: Database) {
  return betterAuth({
    appName: "Klipt",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14, // 14 days
      updateAge: 60 * 60 * 24, // refresh daily while active
      // Sensitive actions (ownership transfer, deletion) require a session
      // younger than this; older sessions must sign in again.
      freshAge: 60 * 15,
    },
    // Must stay last so Set-Cookie works from Server Actions.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __kliptAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  globalForAuth.__kliptAuth ??= getDb().then(createAuth);
  return globalForAuth.__kliptAuth;
}
