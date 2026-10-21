import "server-only";

import { headers } from "next/headers";
import { getDb } from "@/server/db";
import * as ownership from "@/server/ownership";
import * as settings from "@/server/site-settings";
import { appOrigin } from "@/lib/data/email";
import { getCurrentUser, requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/* Data access for site Settings and ownership transfer links. */

export async function getSiteSettings(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return settings.getSiteSettings(await getDb(), user.id, siteId);
}

export async function getOwnership(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return ownership.getOwnershipState(await getDb(), user.id, siteId);
}

export async function getArchivedSites() {
  const user = await requireUser();
  return settings.listArchivedSites(await getDb(), user.id);
}

/** What a transfer link shows, plus who is signed in. */
export async function getTransfer(token: string) {
  await headers();
  const [preview, user] = await Promise.all([
    getDb().then((db) => ownership.previewTransfer(db, token)),
    getCurrentUser(),
  ]);
  return { preview, user };
}

/** Public address of a transfer link, from this request's origin. */
export async function transferUrl(token: string) {
  return `${await appOrigin()}/transfer/${token}`;
}
