import { and, eq, isNotNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import { auditEvents, mediaAssets, siteMembers, sites } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { DomainTakenError, getSiteRole } from "@/server/sites";
import type { Storage } from "@/server/storage";
import { can, type SitePermission } from "@/lib/permissions";
import { domainSchema, generalSettingsSchema, seoDefaultsSchema } from "@/lib/site-settings";

/*
 * Site settings: general details, domain, SEO defaults, archive, restore and
 * delete. Each change checks the member's permission and is audited.
 */

async function requirePermission(
  db: DbOrTx,
  userId: string,
  siteId: string,
  permission: SitePermission,
) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role || !can(role, permission)) throw new NotAllowedError(`Missing ${permission}.`);
  return role;
}

async function audit(
  db: DbOrTx,
  siteId: string,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(auditEvents).values({
    siteId,
    actorId: userId,
    action,
    targetType: "site",
    targetId: siteId,
    metadata,
  });
}

export interface SiteSettings {
  id: string;
  name: string;
  domain: string | null;
  language: string;
  timezone: string;
  allowIndexing: boolean;
  seoDefaults: {
    titleTemplate: string | null;
    ogImage: { id: string; url: string; altText: string | null } | null;
  };
}

export async function getSiteSettings(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<SiteSettings> {
  await requirePermission(db, userId, siteId, "site.view");
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  const imageId = site.seoDefaults.ogImageId;
  const [image] = imageId
    ? await db
        .select({ id: mediaAssets.id, url: mediaAssets.url, altText: mediaAssets.altText })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.siteId, siteId), eq(mediaAssets.id, imageId)))
    : [];
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    language: site.language,
    timezone: site.timezone,
    allowIndexing: site.allowIndexing,
    seoDefaults: { titleTemplate: site.seoDefaults.titleTemplate ?? null, ogImage: image ?? null },
  };
}

export async function updateGeneralSettings(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: unknown,
) {
  const values = generalSettingsSchema.parse(input);
  await db.transaction(async (tx) => {
    await requirePermission(tx, userId, siteId, "site.update");
    await tx
      .update(sites)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(sites.id, siteId));
    await audit(tx, siteId, userId, "site.updated", values);
  });
}

export async function updateDomain(db: DbOrTx, userId: string, siteId: string, input: unknown) {
  const { domain } = domainSchema.parse(input);
  try {
    await db.transaction(async (tx) => {
      await requirePermission(tx, userId, siteId, "site.update");
      if (domain) {
        const [taken] = await tx
          .select({ id: sites.id })
          .from(sites)
          .where(eq(sites.domain, domain))
          .limit(1);
        if (taken && taken.id !== siteId) throw new DomainTakenError();
      }
      const [before] = await tx
        .select({ domain: sites.domain })
        .from(sites)
        .where(eq(sites.id, siteId));
      if (before.domain === domain) return;
      await tx.update(sites).set({ domain, updatedAt: new Date() }).where(eq(sites.id, siteId));
      await audit(tx, siteId, userId, "site.domain_changed", { from: before.domain, to: domain });
    });
  } catch (error) {
    if (isUniqueViolation(error, "sites_domain_unique")) throw new DomainTakenError();
    throw error;
  }
}

export async function updateSeoDefaults(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: unknown,
) {
  const values = seoDefaultsSchema.parse(input);
  await db.transaction(async (tx) => {
    await requirePermission(tx, userId, siteId, "seo.manage");
    if (values.ogImageId) {
      const [image] = await tx
        .select({ mimeType: mediaAssets.mimeType })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.siteId, siteId), eq(mediaAssets.id, values.ogImageId)));
      if (!image?.mimeType.startsWith("image/")) {
        throw new NotAllowedError("Choose an image from this site's media library.");
      }
    }
    await tx
      .update(sites)
      .set({ seoDefaults: values, updatedAt: new Date() })
      .where(eq(sites.id, siteId));
    await audit(tx, siteId, userId, "seo.defaults_changed", values);
  });
}

// ---------------------------------------------------------------------------
// Archive, restore, delete (owner only)
// ---------------------------------------------------------------------------

/** Archives the site: it disappears for everyone, and its API keys stop working, until restored. */
export async function archiveSite(db: DbOrTx, userId: string, siteId: string) {
  await db.transaction(async (tx) => {
    await requirePermission(tx, userId, siteId, "site.archive");
    await tx.update(sites).set({ archivedAt: new Date() }).where(eq(sites.id, siteId));
    await audit(tx, siteId, userId, "site.archived", {});
  });
}

/** Archived sites the user owns (archived sites are hidden from everything else). */
export async function listArchivedSites(db: DbOrTx, userId: string) {
  const rows = await db
    .select({ id: sites.id, name: sites.name, domain: sites.domain, archivedAt: sites.archivedAt })
    .from(siteMembers)
    .innerJoin(sites, eq(sites.id, siteMembers.siteId))
    .where(
      and(
        eq(siteMembers.userId, userId),
        eq(siteMembers.role, "owner"),
        isNotNull(sites.archivedAt),
      ),
    );
  return rows.map((row) => ({ ...row, archivedAt: row.archivedAt!.toISOString() }));
}

async function requireArchivedOwner(tx: DbOrTx, userId: string, siteId: string) {
  const [row] = await tx
    .select({ id: sites.id, name: sites.name })
    .from(siteMembers)
    .innerJoin(sites, eq(sites.id, siteMembers.siteId))
    .where(
      and(
        eq(siteMembers.userId, userId),
        eq(siteMembers.siteId, siteId),
        eq(siteMembers.role, "owner"),
        isNotNull(sites.archivedAt),
      ),
    )
    .limit(1);
  if (!row) throw new NotAllowedError("Archived site not found.");
  return row;
}

export async function restoreSite(db: DbOrTx, userId: string, siteId: string) {
  await db.transaction(async (tx) => {
    await requireArchivedOwner(tx, userId, siteId);
    await tx.update(sites).set({ archivedAt: null }).where(eq(sites.id, siteId));
    await audit(tx, siteId, userId, "site.restored", {});
  });
}

/**
 * Permanently deletes a site and everything in it (content, media, members,
 * keys, webhooks). Works on active or archived sites. Stored files are
 * removed after the database rows are gone.
 */
export async function deleteSite(
  db: DbOrTx,
  storage: Storage | null,
  userId: string,
  siteId: string,
  confirmName: string,
) {
  const files = await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ name: sites.name })
      .from(siteMembers)
      .innerJoin(sites, eq(sites.id, siteMembers.siteId))
      .where(
        and(
          eq(siteMembers.userId, userId),
          eq(siteMembers.siteId, siteId),
          eq(siteMembers.role, "owner"),
        ),
      )
      .for("update", { of: sites })
      .limit(1);
    if (!owned) throw new NotAllowedError("Only the owner can delete a site.");
    if (confirmName.trim() !== owned.name) {
      throw new NotAllowedError("Type the site's name exactly to confirm.");
    }
    const media = await tx
      .select({ key: mediaAssets.storageKey, url: mediaAssets.url })
      .from(mediaAssets)
      .where(eq(mediaAssets.siteId, siteId));
    await tx.delete(sites).where(eq(sites.id, siteId));
    return media;
  });
  if (storage) {
    await Promise.all(files.map((file) => storage.delete(file.key, file.url).catch(() => {})));
  }
}

export { DomainTakenError };
