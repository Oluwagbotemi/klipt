import "server-only";

import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import * as mediaRepo from "@/server/media";
import { resolveMediaInDoc } from "@/server/media-render";
import type { RichTextDoc } from "@/lib/editor/rich-text";
import type { MediaKind, MediaListParams } from "@/lib/media";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/* Data access for the media library; not-found for non-members. */

export async function getMediaList(siteId: string, kind: MediaKind, params: MediaListParams) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return mediaRepo.listMedia(await getDb(), user.id, siteId, kind, params);
}

export async function getMediaAsset(siteId: string, assetId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  const asset = await mediaRepo.getMediaAsset(await getDb(), user.id, siteId, assetId);
  if (!asset) notFound();
  return asset;
}

/** A body with library images updated to their current URL and alt text. */
export async function withCurrentMedia(siteId: string, doc: RichTextDoc) {
  await getSite(siteId);
  return resolveMediaInDoc(await getDb(), siteId, doc);
}
