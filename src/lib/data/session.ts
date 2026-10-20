import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";
import type { UserSummary } from "@/lib/types";

/*
 * Session access. Reads request headers, so callers must render inside a
 * <Suspense> boundary (or a route with loading.tsx) under Cache Components.
 */

export const getSession = cache(async () => {
  // Read the request first: during prerendering this postpones the work to
  // request time, so builds never connect to the database.
  const requestHeaders = await headers();
  const auth = await getAuth();
  return auth.api.getSession({ headers: requestHeaders });
});

/** The signed-in user, or null. Returns only the fields the UI needs. */
export const getCurrentUser = cache(async (): Promise<UserSummary | null> => {
  const session = await getSession();
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
});

/** The signed-in user; redirects to sign-in when there is no valid session. */
export async function requireUser(): Promise<UserSummary> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Re-checks the signed-in user's password before sensitive actions (transfer, delete). */
export async function verifyCurrentPassword(password: string): Promise<boolean> {
  if (!password || password.length > 128) return false;
  const requestHeaders = await headers();
  const auth = await getAuth();
  try {
    const result = await auth.api.verifyPassword({ body: { password }, headers: requestHeaders });
    return result.status === true;
  } catch {
    return false;
  }
}
