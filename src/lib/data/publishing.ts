import "server-only";

import { getDb } from "@/server/db";
import * as publishing from "@/server/publishing";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/* Data access for Settings › Publishing. */

export async function getPublishingSettings(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return publishing.getPublishingSettings(await getDb(), user.id, siteId);
}

/** The site's URL patterns, for showing entry paths in lists (any member). */
export async function getPathRules(siteId: string) {
  await getSite(siteId);
  return publishing.loadPathRules(await getDb(), siteId);
}

/** The content type "New" offers first (Settings › Publishing), for any member. */
export async function getDefaultModelKey(siteId: string): Promise<string> {
  await getSite(siteId);
  return publishing.getDefaultModelKey(await getDb(), siteId);
}
