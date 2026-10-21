import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import * as taxonomyRepo from "@/server/taxonomy";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/* Data access for Structure › Taxonomy and the editor's "Categories & tags" panel. */

export const getTaxonomies = cache(async (siteId: string) => {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return taxonomyRepo.listTaxonomies(await getDb(), user.id, siteId);
});

/** A taxonomy and its terms; not-found when the site has no taxonomy with that key. */
export async function getTerms(siteId: string, taxonomyKey: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  const result = await taxonomyRepo.listTerms(await getDb(), user.id, siteId, taxonomyKey);
  if (!result) notFound();
  return result;
}

export async function getEntryTaxonomies(siteId: string, entryId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return taxonomyRepo.getEntryTaxonomies(await getDb(), user.id, siteId, entryId);
}
