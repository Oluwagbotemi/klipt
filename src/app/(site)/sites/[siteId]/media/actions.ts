"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import {
  deleteMedia,
  getMediaAsset,
  listMedia,
  updateMediaDetails,
  uploadMedia,
  UploadError,
} from "@/server/media";
import { getStorage, StorageNotConfiguredError } from "@/server/storage";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import {
  MAX_UPLOAD_BYTES,
  mediaDetailsSchema,
  parseMediaListParams,
  type MediaAssetSummary,
  type MediaList,
} from "@/lib/media";

/*
 * Media Server Actions. Arguments come from the browser, so everything is
 * validated, and each action authorizes before touching data or storage.
 */

const id = z.string().min(1).max(64);
const NO_PERMISSION = "You don't have permission to do that on this site.";

export type UploadResult = { ok: true; asset: MediaAssetSummary } | { ok: false; error: string };

/** Uploads one file (the browser sends files one at a time). */
export async function uploadMediaAction(formData: FormData): Promise<UploadResult> {
  const siteId = id.safeParse(formData.get("siteId"));
  const file = formData.get("file");
  if (!siteId.success || !(file instanceof File)) return { ok: false, error: "Choose a file." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Files can be up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` };
  }
  try {
    const { user } = await requireSitePermission(siteId.data, "media.upload");
    const asset = await uploadMedia(await getDb(), getStorage(), user.id, siteId.data, {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    refresh();
    return { ok: true, asset };
  } catch (error) {
    if (error instanceof UploadError || error instanceof StorageNotConfiguredError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false, error: NO_PERMISSION };
    }
    console.error("Upload failed", error);
    return { ok: false, error: "The upload didn't finish. Try again." };
  }
}

export interface MediaDetailsState {
  values: { altText: string; caption: string };
  errors?: { altText?: string; caption?: string; form?: string };
  saved?: boolean;
}

export async function saveMediaDetailsAction(
  _previous: MediaDetailsState,
  formData: FormData,
): Promise<MediaDetailsState> {
  const values = {
    altText: String(formData.get("altText") ?? ""),
    caption: String(formData.get("caption") ?? ""),
  };
  const siteId = id.safeParse(formData.get("siteId"));
  const assetId = id.safeParse(formData.get("assetId"));
  if (!siteId.success || !assetId.success) {
    return { values, errors: { form: "That file couldn't be found." } };
  }
  const parsed = mediaDetailsSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return { values, errors: { altText: fields.altText?.[0], caption: fields.caption?.[0] } };
  }
  try {
    const { user } = await requireSitePermission(siteId.data, "site.view");
    await updateMediaDetails(await getDb(), user.id, siteId.data, assetId.data, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: "You can't change this file, or it was deleted." } };
    }
    throw error;
  }
  refresh();
  return { values: parsed.data, saved: true };
}

/** Sets just the alt text (from the editor's image picker). */
export async function setAltTextAction(
  siteId: string,
  assetId: string,
  altText: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z
    .object({ siteId: id, assetId: id, altText: mediaDetailsSchema.shape.altText })
    .safeParse({ siteId, assetId, altText });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const { user } = await requireSitePermission(siteId, "site.view");
    const db = await getDb();
    const asset = await getMediaAsset(db, user.id, siteId, assetId);
    if (!asset) return { ok: false, error: "That file was deleted." };
    await updateMediaDetails(db, user.id, siteId, assetId, {
      altText: parsed.data.altText,
      caption: asset.caption ?? "",
    });
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false, error: "You can't change this image's alt text." };
    }
    throw error;
  }
  return { ok: true };
}

export async function deleteMediaAction(
  siteId: string,
  assetIds: string[],
): Promise<{ deleted: number; skipped: number; error?: string }> {
  const input = z.object({ siteId: id, assetIds: z.array(id).min(1).max(200) }).safeParse({
    siteId,
    assetIds,
  });
  if (!input.success) return { deleted: 0, skipped: 0, error: "Nothing to delete." };
  const { user } = await requireSitePermission(siteId, "site.view");
  let storage;
  try {
    storage = getStorage();
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return { deleted: 0, skipped: assetIds.length, error: error.message };
    }
    throw error;
  }
  const result = await deleteMedia(await getDb(), storage, user.id, siteId, input.data.assetIds);
  refresh();
  return result;
}

/** Images for the editor's picker. */
export async function pickMediaAction(
  siteId: string,
  query: { q?: string; page?: number },
): Promise<MediaList | null> {
  if (!id.safeParse(siteId).success) return null;
  const { user } = await requireSitePermission(siteId, "site.view");
  return listMedia(
    await getDb(),
    user.id,
    siteId,
    "images",
    parseMediaListParams({ q: query.q ?? "", page: String(query.page ?? 1) }),
  );
}
