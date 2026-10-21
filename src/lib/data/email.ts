import "server-only";

import { headers } from "next/headers";
import { getDb } from "@/server/db";
import { sendInBackground } from "@/server/email/background";
import { emailEnabled } from "@/server/email/transport";
import { entryMessages, type EntryEvent } from "@/server/notifications";
import type { EmailMessage } from "@/server/email/transport";

/*
 * Email from Server Actions and pages. Messages are built and sent after the
 * response (see src/server/email/background.ts); a failed send is logged and
 * never fails the action.
 */

/** Whether this deployment sends email (Resend, or the dev outbox locally). */
export function isEmailEnabled() {
  return emailEnabled();
}

/** The public origin of this request, e.g. https://cms.example (links in emails). */
export async function appOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** Sends messages (or what `build` returns) after the response. */
export function sendLater(build: EmailMessage[] | (() => Promise<EmailMessage[]>)) {
  if (!emailEnabled()) return;
  sendInBackground(build);
}

/** Assignment and review emails about one entry, after `actorId` changed it. */
export async function notifyAboutEntry(
  siteId: string,
  entryId: string,
  actorId: string,
  event: EntryEvent,
) {
  if (!emailEnabled()) return;
  const origin = await appOrigin();
  sendInBackground(async () =>
    entryMessages(await getDb(), { siteId, entryId, actorId, origin, event }),
  );
}
