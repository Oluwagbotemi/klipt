import { and, eq, inArray, or } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { mediaAssets, sites } from "@/server/db/schema";
import { recordActivity } from "@/server/activity";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import {
  brandImageError,
  type BrandImage,
  type BrandSlot,
  type SiteBranding,
} from "@/lib/branding";
import { can } from "@/lib/permissions";

/*
 * Site branding: a logo and a favicon, each a media library image linked from
 * sites.logo_media_id / sites.favicon_media_id (set null when the file is deleted).
 * Changing them needs site.update, like the other Settings › General fields.
 */

export class BrandImageError extends Error {}

const COLUMN = { logo: sites.logoMediaId, favicon: sites.faviconMediaId } as const;

const imageColumns = {
  id: mediaAssets.id,
  url: mediaAssets.url,
  width: mediaAssets.width,
  height: mediaAssets.height,
  altText: mediaAssets.altText,
};

/** Logo and favicon of several sites at once (for site lists and the top bar). */
export async function brandingForSites(
  db: DbOrTx,
  siteIds: string[],
): Promise<Map<string, SiteBranding>> {
  const result = new Map<string, SiteBranding>();
  if (siteIds.length === 0) return result;
  const rows = await db
    .select({ siteId: sites.id, logoId: sites.logoMediaId, faviconId: sites.faviconMediaId })
    .from(sites)
    .where(inArray(sites.id, siteIds));
  const ids = rows.flatMap((row) => [row.logoId, row.faviconId]).filter((id) => id !== null);
  const images = ids.length
    ? await db.select(imageColumns).from(mediaAssets).where(inArray(mediaAssets.id, ids))
    : [];
  const byId = new Map<string, BrandImage>(images.map((image) => [image.id, image]));
  for (const row of rows) {
    result.set(row.siteId, {
      logo: (row.logoId && byId.get(row.logoId)) || null,
      favicon: (row.faviconId && byId.get(row.faviconId)) || null,
    });
  }
  return result;
}

export async function getSiteBranding(db: DbOrTx, siteId: string): Promise<SiteBranding> {
  return (await brandingForSites(db, [siteId])).get(siteId) ?? { logo: null, favicon: null };
}

/**
 * Links a media library image as the site's logo or favicon, or unlinks it
 * (mediaId null). The image stays in the library either way.
 */
export async function setBrandImage(
  db: DbOrTx,
  userId: string,
  siteId: string,
  slot: BrandSlot,
  mediaId: string | null,
): Promise<SiteBranding> {
  await db.transaction(async (tx) => {
    const role = await getSiteRole(tx, userId, siteId);
    if (!role || !can(role, "site.update")) throw new NotAllowedError("Missing site.update.");
    const [current] = await tx
      .select({ id: COLUMN[slot] })
      .from(sites)
      .where(eq(sites.id, siteId))
      .for("update");
    if ((current?.id ?? null) === mediaId) return;

    let filename: string | null = null;
    if (mediaId) {
      const [image] = await tx
        .select({
          mimeType: mediaAssets.mimeType,
          width: mediaAssets.width,
          height: mediaAssets.height,
          filename: mediaAssets.filename,
        })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.siteId, siteId), eq(mediaAssets.id, mediaId)));
      if (!image) throw new BrandImageError("Choose an image from this site's media library.");
      const problem = brandImageError(slot, image);
      if (problem) throw new BrandImageError(problem);
      filename = image.filename;
    }

    await tx
      .update(sites)
      .set({ [slot === "logo" ? "logoMediaId" : "faviconMediaId"]: mediaId, updatedAt: new Date() })
      .where(eq(sites.id, siteId));
    await recordActivity(tx, {
      siteId,
      actorId: userId,
      action: slot === "logo" ? "site.logo_changed" : "site.favicon_changed",
      targetType: "site",
      targetId: siteId,
      metadata: mediaId ? { mediaId, filename } : { removed: true },
    });
  });
  return getSiteBranding(db, siteId);
}

/** Which brand slots each of these files fills (for the media library's "Used in"). */
export async function brandUsesOf(
  db: DbOrTx,
  siteId: string,
  assetIds: string[],
): Promise<Map<string, BrandSlot[]>> {
  const uses = new Map<string, BrandSlot[]>();
  if (assetIds.length === 0) return uses;
  const [row] = await db
    .select({ logo: sites.logoMediaId, favicon: sites.faviconMediaId })
    .from(sites)
    .where(
      and(
        eq(sites.id, siteId),
        or(inArray(sites.logoMediaId, assetIds), inArray(sites.faviconMediaId, assetIds)),
      ),
    );
  if (!row) return uses;
  for (const slot of ["logo", "favicon"] as const) {
    const id = row[slot];
    if (id) uses.set(id, [...(uses.get(id) ?? []), slot]);
  }
  return uses;
}
