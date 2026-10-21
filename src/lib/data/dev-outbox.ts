import "server-only";

import { headers } from "next/headers";
import { emailMode, listOutbox, readOutboxEmail } from "@/server/email/transport";

/*
 * The dev outbox viewer (/dev/emails). Only when emails go to the local outbox
 * (no RESEND_API_KEY) and only for requests to localhost: outbox emails hold
 * live reset and invitation links.
 */

async function outboxAvailable() {
  // Read the request first: whether the outbox exists is decided per request, never at build.
  const h = await headers();
  if (emailMode() !== "outbox") return false;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

export async function getOutbox() {
  if (!(await outboxAvailable())) return null;
  return listOutbox();
}

export async function getOutboxEmail(id: string) {
  if (!(await outboxAvailable())) return null;
  return readOutboxEmail(id);
}
