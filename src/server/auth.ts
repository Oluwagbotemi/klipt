import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, type Database } from "@/server/db";
import { accounts, sessions, users, verifications } from "@/server/db/schema";
import { sendInBackground } from "@/server/email/background";
import { passwordResetEmail, verifyEmailEmail } from "@/server/email/templates";

const RESET_MINUTES = 60;

/*
 * Authentication (Better Auth, email + password). Sessions are stored in our
 * database. Requires BETTER_AUTH_SECRET in production; BETTER_AUTH_URL should
 * be the public origin of the app (reset and confirmation links use it).
 * Password-reset and email-confirmation emails go out via src/server/email.
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
      resetPasswordTokenExpiresIn: RESET_MINUTES * 60,
      // A reset signs every device out; the user signs in again with the new password.
      revokeSessionsOnPasswordReset: true,
      // Sent after the response, so timing never reveals whether the account exists.
      sendResetPassword: async ({ user, token, url }) => {
        const link = `${new URL(url).origin}/reset-password?token=${encodeURIComponent(token)}`;
        sendInBackground([
          {
            to: user.email,
            ...passwordResetEmail({ name: user.name, url: link, minutes: RESET_MINUTES }),
          },
        ]);
      },
    },
    // Verification is encouraged, never required to sign in.
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        const link = new URL(url);
        link.searchParams.set("callbackURL", "/email-verified");
        sendInBackground([
          { to: user.email, ...verifyEmailEmail({ name: user.name, url: link.href }) },
        ]);
      },
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
