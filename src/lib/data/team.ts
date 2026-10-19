import "server-only";

import { headers } from "next/headers";
import { getDb } from "@/server/db";
import * as teamRepo from "@/server/team";
import { getCurrentUser, requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/* Data access for the Team section and invitation links. */

export async function getTeam(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return teamRepo.listTeam(await getDb(), user.id, siteId);
}

/** What an invitation link shows, plus who is signed in (if anyone). */
export async function getInvitation(token: string) {
  await headers();
  const [preview, user] = await Promise.all([
    getDb().then((db) => teamRepo.previewInvitation(db, token)),
    getCurrentUser(),
  ]);
  return { preview, user };
}

/** The public address of an invitation, from this request's origin. */
export async function invitationUrl(token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}/invite/${token}`;
}
