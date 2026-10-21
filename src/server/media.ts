import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { auditEvents, contentEntries, contentModels, mediaAssets, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { identifyFile } from "@/server/file-type";
import { getSiteRole } from "@/server/sites";
import type { Storage } from "@/server/storage";
import { slugify } from "@/lib/content";
import {
  ACCEPTED_TYPES,
  canManageMedia,
  MAX_UPLOAD_BYTES,
  MEDIA_PAGE_SIZE,
  mediaDetailsSchema,
  type MediaAssetSummary,
  type MediaKind,
  type MediaList,
  type MediaListParams,
  type MediaUsage,
} from "@/lib/media";
import { can } from "@/lib/permissions";

/*
 * Media library queries and uploads. Every function takes an explicit
 * userId and checks the member's role on the site.
 */

export class UploadError extends Error {}

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  return role;
}

const summaryColumns = {
  id: mediaAssets.id,
  url: mediaAssets.url,
  filename: mediaAssets.filename,
  mimeType: mediaAssets.mimeType,
  sizeBytes: mediaAssets.sizeBytes,
  width: mediaAssets.width,
  height: mediaAssets.height,
  altText: mediaAssets.altText,
  caption: mediaAssets.caption,
  uploadedById: mediaAssets.uploadedById,
  uploadedByName: users.name,
  createdAt: mediaAssets.createdAt,
};

type SummaryRow = Omit<MediaAssetSummary, "createdAt"> & { createdAt: Date };
const toSummary = (row: SummaryRow): MediaAssetSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

const isImage = like(mediaAssets.mimeType, "image/%");
const missingAlt = and(isImage, or(isNull(mediaAssets.altText), eq(mediaAssets.altText, "")));

const ORDER = {
  newest: [desc(mediaAssets.createdAt), asc(mediaAssets.id)],
  oldest: [asc(mediaAssets.createdAt), asc(mediaAssets.id)],
  name: [asc(sql`lower(${mediaAssets.filename})`), asc(mediaAssets.id)],
  largest: [desc(mediaAssets.sizeBytes), asc(mediaAssets.id)],
} satisfies Record<MediaListParams["sort"], SQL[]>;

export async function listMedia(
  db: DbOrTx,
  userId: string,
  siteId: string,
  kind: MediaKind,
  params: MediaListParams,
): Promise<MediaList> {
  await requireRole(db, userId, siteId);
  const inSite = eq(mediaAssets.siteId, siteId);
  const kindFilter =
    kind === "images" ? isImage : kind === "files" ? sql`not ${isImage}` : undefined;
  const needle = params.q ? `%${params.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const where = and(
    inSite,
    kindFilter,
    params.alt === "missing" ? missingAlt : undefined,
    needle
      ? or(
          ilike(mediaAssets.filename, needle),
          ilike(mediaAssets.altText, needle),
          ilike(mediaAssets.caption, needle),
        )
      : undefined,
  );

  const [[{ total }], [counts]] = await Promise.all([
    db.select({ total: count() }).from(mediaAssets).where(where),
    db
      .select({
        all: count(),
        images: sql<number>`count(*) filter (where ${isImage})`.mapWith(Number),
        missingAlt: sql<number>`count(*) filter (where ${missingAlt})`.mapWith(Number),
      })
      .from(mediaAssets)
      .where(inSite),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = await db
    .select(summaryColumns)
    .from(mediaAssets)
    .leftJoin(users, eq(users.id, mediaAssets.uploadedById))
    .where(where)
    .orderBy(...ORDER[params.sort])
    .limit(MEDIA_PAGE_SIZE)
    .offset((page - 1) * MEDIA_PAGE_SIZE);

  return {
    items: rows.map(toSummary),
    total,
    page,
    pageCount,
    counts: { ...counts, files: counts.all - counts.images },
  };
}

/** Entries whose content refers to these files (by media id or URL). */
export async function usageOf(db: DbOrTx, siteId: string, assets: { id: string; url: string }[]) {
  if (assets.length === 0) return new Map<string, MediaUsage[]>();
  const rows = await db
    .select({
      id: contentEntries.id,
      title: contentEntries.title,
      status: contentEntries.status,
      modelKey: contentModels.key,
      text: sql<string>`${contentEntries.data}::text || ${contentEntries.seo}::text`,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(
      and(
        eq(contentEntries.siteId, siteId),
        or(
          ...assets.flatMap((asset) => [
            sql`position(${asset.id} in ${contentEntries.data}::text || ${contentEntries.seo}::text) > 0`,
            sql`position(${asset.url} in ${contentEntries.data}::text) > 0`,
          ]),
        ),
      ),
    );
  const usage = new Map<string, MediaUsage[]>();
  for (const asset of assets) {
    usage.set(
      asset.id,
      rows
        .filter((row) => row.text.includes(asset.id) || row.text.includes(asset.url))
        .map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          modelKey: row.modelKey,
        })),
    );
  }
  return usage;
}

export async function getMediaAsset(
  db: DbOrTx,
  userId: string,
  siteId: string,
  assetId: string,
): Promise<(MediaAssetSummary & { usage: MediaUsage[] }) | null> {
  await requireRole(db, userId, siteId);
  const [row] = await db
    .select(summaryColumns)
    .from(mediaAssets)
    .leftJoin(users, eq(users.id, mediaAssets.uploadedById))
    .where(and(eq(mediaAssets.siteId, siteId), eq(mediaAssets.id, assetId)))
    .limit(1);
  if (!row) return null;
  const usage = await usageOf(db, siteId, [row]);
  return { ...toSummary(row), usage: usage.get(row.id) ?? [] };
}

/** "Harbour Seals (1).JPG" → "harbour-seals-1.jpg", with the extension of the real type. */
function safeFilename(name: string, ext: string) {
  const base = slugify(name.replace(/\.[^.]*$/, "")).slice(0, 80) || "file";
  return `${base}.${ext}`;
}

/** Checks, stores and records one uploaded file. */
export async function uploadMedia(
  db: DbOrTx,
  storage: Storage,
  userId: string,
  siteId: string,
  file: { name: string; bytes: Uint8Array },
): Promise<MediaAssetSummary> {
  const role = await requireRole(db, userId, siteId);
  if (!can(role, "media.upload")) throw new NotAllowedError("Can't upload files.");
  if (file.bytes.length === 0) throw new UploadError("This file is empty.");
  if (file.bytes.length > MAX_UPLOAD_BYTES) {
    throw new UploadError(`Files can be up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  }
  const info = identifyFile(file.bytes);
  if (!info) {
    throw new UploadError("This file type isn't supported. Use JPEG, PNG, WebP, GIF, AVIF or PDF.");
  }

  const displayName = file.name.trim().slice(0, 200) || "file";
  const key = `sites/${siteId}/${randomUUID()}/${safeFilename(displayName, ACCEPTED_TYPES[info.mimeType].ext)}`;
  const url = await storage.put(key, file.bytes, info.mimeType);
  try {
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        siteId,
        storageKey: key,
        url,
        filename: displayName,
        mimeType: info.mimeType,
        sizeBytes: file.bytes.length,
        width: info.width,
        height: info.height,
        uploadedById: userId,
      })
      .returning();
    await db.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "media.uploaded",
      targetType: "media_asset",
      targetId: asset.id,
      metadata: { filename: displayName, sizeBytes: asset.sizeBytes },
    });
    const [uploader] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId));
    return toSummary({ ...asset, uploadedByName: uploader?.name ?? null });
  } catch (error) {
    // Don't leave an orphaned file behind if the database write failed.
    await storage.delete(key, url).catch(() => {});
    throw error;
  }
}

async function lockManageable(tx: DbOrTx, userId: string, siteId: string, assetId: string) {
  const role = await requireRole(tx, userId, siteId);
  const [asset] = await tx
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.siteId, siteId), eq(mediaAssets.id, assetId)))
    .for("update")
    .limit(1);
  if (!asset) throw new NotAllowedError("File not found.");
  if (!canManageMedia(role, userId, asset)) throw new NotAllowedError("Can't change this file.");
  return asset;
}

export async function updateMediaDetails(
  db: DbOrTx,
  userId: string,
  siteId: string,
  assetId: string,
  input: { altText: string; caption: string },
) {
  const details = mediaDetailsSchema.parse(input);
  await db.transaction(async (tx) => {
    await lockManageable(tx, userId, siteId, assetId);
    await tx
      .update(mediaAssets)
      .set({
        altText: details.altText || null,
        caption: details.caption || null,
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, assetId));
  });
}

/** Deletes the files the member may manage; returns how many were deleted. */
export async function deleteMedia(
  db: DbOrTx,
  storage: Storage,
  userId: string,
  siteId: string,
  assetIds: string[],
): Promise<{ deleted: number; skipped: number }> {
  const role = await requireRole(db, userId, siteId);
  const ids = [...new Set(assetIds)].slice(0, 200);
  const removed = await db.transaction(async (tx) => {
    const assets = await tx
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.siteId, siteId), inArray(mediaAssets.id, ids)))
      .for("update");
    const allowed = assets.filter((asset) => canManageMedia(role, userId, asset));
    if (allowed.length === 0) return [];
    await tx.delete(mediaAssets).where(
      inArray(
        mediaAssets.id,
        allowed.map((asset) => asset.id),
      ),
    );
    await tx.insert(auditEvents).values(
      allowed.map((asset) => ({
        siteId,
        actorId: userId,
        action: "media.deleted",
        targetType: "media_asset",
        targetId: asset.id,
        metadata: { filename: asset.filename },
      })),
    );
    return allowed;
  });
  // Remove stored files after the rows are gone; a failure only leaves an unused file.
  await Promise.all(
    removed.map((asset) => storage.delete(asset.storageKey, asset.url).catch(() => {})),
  );
  return { deleted: removed.length, skipped: ids.length - removed.length };
}

/** Current details of images referenced from content, for rendering. */
export async function mediaByIds(db: DbOrTx, siteId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, typeof mediaAssets.$inferSelect>();
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.siteId, siteId), inArray(mediaAssets.id, [...new Set(ids)])));
  return new Map(rows.map((row) => [row.id, row]));
}
