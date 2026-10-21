import "server-only";

import { redirect } from "next/navigation";
import { listOwnedSites, listSessions } from "@/server/account";
import { getDb } from "@/server/db";
import { emailEnabled } from "@/server/email/transport";
import { getNotificationSettings } from "@/server/notifications";
import { getSession } from "@/lib/data/session";

/** The signed-in user's session; redirects to sign-in when there is none. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** The signed-in user's devices, this one first. */
export async function getAccountSessions() {
  const { user, session } = await requireSession();
  return listSessions(await getDb(), user.id, session.id);
}

/** Sites the signed-in user owns (archived included); these block account deletion. */
export async function getOwnedSites() {
  const { user } = await requireSession();
  return listOwnedSites(await getDb(), user.id);
}

/** Email status for the account page: verified, notification setting, and whether Klipt sends email. */
export async function getEmailSettings() {
  const { user } = await requireSession();
  const settings = await getNotificationSettings(await getDb(), user.id);
  return {
    verified: user.emailVerified,
    assignmentEmails: settings.assignments,
    emailEnabled: emailEnabled(),
  };
}
