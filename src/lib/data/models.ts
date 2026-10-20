import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import * as modelsRepo from "@/server/models";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import type { CollectionType } from "@/lib/models";

/* Data access for content models (Structure › Content models). */

export const getModels = cache(async (siteId: string) => {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return modelsRepo.listModels(await getDb(), user.id, siteId);
});

/** Custom content types, for "New" menus ({ key, name } only). */
export async function getCollectionTypes(siteId: string): Promise<CollectionType[]> {
  const models = await getModels(siteId);
  return models.filter((model) => !model.isSystem).map(({ key, name }) => ({ key, name }));
}

/** One content type; not-found when it isn't part of the site. */
export async function getModel(siteId: string, modelId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  const model = await modelsRepo.getModel(await getDb(), user.id, siteId, modelId);
  if (!model) notFound();
  return model;
}
