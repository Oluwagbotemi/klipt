import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import * as contentRepo from "@/server/content";
import * as editorRepo from "@/server/editor";
import type { ContentListParams, ContentType } from "@/lib/content";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/*
 * Data access layer for content. Resolves the user from the session and
 * renders not-found for sites they aren't a member of.
 */

export async function getEntries(siteId: string, type: ContentType, params: ContentListParams) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return contentRepo.listEntries(await getDb(), user.id, siteId, type, params);
}

/** Everything the editor needs for one entry; not-found for non-members. */
export const getEntryDocument = cache(async (siteId: string, entryId: string) => {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  const doc = await editorRepo.getEntryDocument(await getDb(), user.id, siteId, entryId);
  if (!doc) notFound();
  return doc;
});
