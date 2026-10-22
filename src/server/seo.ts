import { and, asc, count, eq, inArray, like, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import {
  auditEvents,
  contentEntries,
  contentModels,
  mediaAssets,
  redirects,
  sites,
  users,
} from "@/server/db/schema";
import { publishDueEntries } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { loadPathRules } from "@/server/path-rules";
import { getSiteRole } from "@/server/sites";
import { EMPTY_DOC, sanitizeDoc, type RichTextNode } from "@/lib/editor/rich-text";
import { can } from "@/lib/permissions";
import { auditSite, type SiteAudit } from "@/lib/seo-audit";
import { entrySeoSchema, redirectInputSchema, type RedirectRow } from "@/lib/seo";
import { entryDate, entryPath } from "@/lib/url-patterns";

export type { RedirectRow };

/*
 * The SEO section: page audit, internal links, sitemap view, redirects and
 * the site-wide search visibility switch. Reads need membership; changes
 * need seo.manage.
 */

/** Live pages examined per audit (newest first). */
export const AUDIT_LIMIT = 2000;

export class RedirectError extends Error {
  constructor(
    message: string,
    readonly field: "from" | "to" | "form" = "form",
  ) {
    super(message);
  }
}

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  return role;
}

async function requireSeoManager(db: DbOrTx, userId: string, siteId: string) {
  const role = await requireRole(db, userId, siteId);
  if (!can(role, "seo.manage")) throw new NotAllowedError("Can't manage SEO settings.");
}

function collectMediaIds(node: RichTextNode, ids: Set<string>) {
  if (node.type === "image" && typeof node.attrs?.mediaId === "string") ids.add(node.attrs.mediaId);
  node.content?.forEach((child) => collectMediaIds(child, ids));
}

/** Audits a site's live pages. Callers check membership. */
export async function loadSiteAudit(
  db: DbOrTx,
  siteId: string,
): Promise<
  SiteAudit & {
    allowIndexing: boolean;
    domain: string | null;
    truncated: boolean;
  }
> {
  const [[site], rows, redirectRows, rules] = await Promise.all([
    db
      .select({ domain: sites.domain, allowIndexing: sites.allowIndexing })
      .from(sites)
      .where(eq(sites.id, siteId)),
    db
      .select({
        id: contentEntries.id,
        title: contentEntries.title,
        slug: contentEntries.slug,
        seo: contentEntries.seo,
        data: contentEntries.data,
        updatedAt: contentEntries.updatedAt,
        publishedAt: contentEntries.publishedAt,
        modelKey: contentModels.key,
      })
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.status, "published")))
      .orderBy(sql`${contentEntries.publishedAt} desc nulls last`)
      .limit(AUDIT_LIMIT + 1),
    db.select({ from: redirects.fromPath }).from(redirects).where(eq(redirects.siteId, siteId)),
    loadPathRules(db, siteId),
  ]);

  const inputs = rows.slice(0, AUDIT_LIMIT).map((row) => {
    let body: RichTextNode = EMPTY_DOC;
    try {
      body = row.data.body ? sanitizeDoc(row.data.body) : EMPTY_DOC;
    } catch {
      // Unreadable bodies count as empty.
    }
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      modelKey: row.modelKey,
      path: entryPath(rules, row.modelKey, row.slug, row.publishedAt),
      seo: entrySeoSchema.catch({}).parse(row.seo),
      body,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  const mediaIds = new Set<string>();
  inputs.forEach((input) => collectMediaIds(input.body, mediaIds));
  const media = mediaIds.size
    ? await db
        .select({ id: mediaAssets.id, altText: mediaAssets.altText })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.siteId, siteId), inArray(mediaAssets.id, [...mediaIds])))
    : [];

  const audit = auditSite(inputs, {
    domain: site?.domain ?? null,
    allowIndexing: site?.allowIndexing ?? true,
    altByMediaId: new Map(media.map((m) => [m.id, m.altText ?? ""])),
    redirectFrom: new Set(redirectRows.map((r) => r.from)),
  });
  return {
    ...audit,
    allowIndexing: site?.allowIndexing ?? true,
    domain: site?.domain ?? null,
    truncated: rows.length > AUDIT_LIMIT,
  };
}

export async function getSeoReport(db: DbOrTx, userId: string, siteId: string) {
  await requireRole(db, userId, siteId);
  await publishDueEntries(db, siteId);
  const [audit, [{ redirectCount }], [{ imagesMissingAlt }]] = await Promise.all([
    loadSiteAudit(db, siteId),
    db.select({ redirectCount: count() }).from(redirects).where(eq(redirects.siteId, siteId)),
    db
      .select({ imagesMissingAlt: count() })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.siteId, siteId),
          like(mediaAssets.mimeType, "image/%"),
          sql`coalesce(${mediaAssets.altText}, '') = ''`,
        ),
      ),
  ]);
  return {
    ...audit,
    redirectCount,
    imagesMissingAlt,
    indexable: audit.pages.filter((page) => page.index).length,
    inSitemap: audit.pages.filter((page) => page.inSitemap).length,
  };
}
export type SeoReport = Awaited<ReturnType<typeof getSeoReport>>;

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

export async function listSiteRedirects(
  db: DbOrTx,
  userId: string,
  siteId: string,
  query = "",
): Promise<RedirectRow[]> {
  await requireRole(db, userId, siteId);
  const needle = query.trim().toLowerCase();
  const rows = await db
    .select({
      id: redirects.id,
      from: redirects.fromPath,
      to: redirects.toPath,
      statusCode: redirects.statusCode,
      entryId: contentEntries.id,
      entryTitle: contentEntries.title,
      createdByName: users.name,
      updatedAt: redirects.updatedAt,
    })
    .from(redirects)
    .leftJoin(contentEntries, eq(contentEntries.id, redirects.entryId))
    .leftJoin(users, eq(users.id, redirects.createdById))
    .where(
      and(
        eq(redirects.siteId, siteId),
        needle
          ? sql`(position(${needle} in lower(${redirects.fromPath})) > 0 or position(${needle} in lower(${redirects.toPath})) > 0)`
          : undefined,
      ),
    )
    .orderBy(asc(redirects.fromPath))
    .limit(1000);
  return rows.map((row) => ({
    id: row.id,
    from: row.from,
    to: row.to,
    statusCode: row.statusCode,
    entry: row.entryId ? { id: row.entryId, title: row.entryTitle ?? "Untitled" } : null,
    createdByName: row.createdByName,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Paths of live entries, to stop redirects from hiding them. */
async function livePathSet(tx: DbOrTx, siteId: string) {
  const rows = await tx
    .select({
      slug: contentEntries.slug,
      modelKey: contentModels.key,
      publishedAt: contentEntries.publishedAt,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.status, "published")));
  const rules = await loadPathRules(tx, siteId);
  return new Set(rows.map((row) => entryPath(rules, row.modelKey, row.slug, entryDate(row))));
}

/**
 * Creates or updates a redirect. Keeps redirects one hop long: a target that
 * itself redirects is followed to its final destination, and redirects that
 * pointed at this one's old address are re-pointed. Loops are refused.
 */
export async function saveRedirect(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: unknown,
  redirectId?: string,
): Promise<{ id: string; from: string; to: string; repointed: number }> {
  const parsed = redirectInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new RedirectError(
      issue.message,
      issue.path[0] === "to" ? "to" : issue.path[0] === "from" ? "from" : "form",
    );
  }
  const { from, statusCode } = parsed.data;

  return db.transaction(async (tx) => {
    await requireSeoManager(tx, userId, siteId);
    // Serialize redirect changes per site so chain rules can't race.
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for("update");

    const all = await tx
      .select({ id: redirects.id, from: redirects.fromPath, to: redirects.toPath })
      .from(redirects)
      .where(eq(redirects.siteId, siteId));
    const current = redirectId ? all.find((r) => r.id === redirectId) : undefined;
    if (redirectId && !current) throw new NotAllowedError("Redirect not found.");
    const others = all.filter((r) => r.id !== redirectId);

    if (others.some((r) => r.from === from)) {
      throw new RedirectError(
        `${from} already redirects somewhere. Edit that redirect instead.`,
        "from",
      );
    }
    if ((await livePathSet(tx, siteId)).has(from)) {
      throw new RedirectError(
        `A published page lives at ${from}. Visitors would see the page, not the redirect; unpublish it or change its URL first.`,
        "from",
      );
    }

    // Follow the target to its final destination (no chains).
    const byFrom = new Map(others.map((r) => [r.from, r.to]));
    let to = parsed.data.to;
    for (let hops = 0; byFrom.has(to) && hops < 20; hops++) to = byFrom.get(to)!;
    if (to === from) {
      throw new RedirectError("This would send visitors in a loop back to the same address.", "to");
    }

    let id = redirectId;
    if (current) {
      await tx
        .update(redirects)
        .set({ fromPath: from, toPath: to, statusCode, updatedAt: new Date() })
        .where(eq(redirects.id, current.id));
    } else {
      const [row] = await tx
        .insert(redirects)
        .values({ siteId, fromPath: from, toPath: to, statusCode, createdById: userId })
        .returning({ id: redirects.id });
      id = row.id;
    }

    // Redirects that pointed at this address now point straight at the destination.
    const pointing = others.filter((r) => r.to === from || (current && r.to === current.from));
    for (const redirect of pointing) {
      if (redirect.from === to) {
        await tx.delete(redirects).where(eq(redirects.id, redirect.id));
      } else {
        await tx
          .update(redirects)
          .set({ toPath: to, updatedAt: new Date() })
          .where(eq(redirects.id, redirect.id));
      }
    }

    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: current ? "redirect.updated" : "redirect.created",
      targetType: "redirect",
      targetId: id!,
      metadata: { from, to, statusCode },
    });
    return { id: id!, from, to, repointed: pointing.length };
  });
}

export async function deleteRedirects(
  db: DbOrTx,
  userId: string,
  siteId: string,
  redirectIds: string[],
): Promise<number> {
  return db.transaction(async (tx) => {
    await requireSeoManager(tx, userId, siteId);
    const removed = await tx
      .delete(redirects)
      .where(and(eq(redirects.siteId, siteId), inArray(redirects.id, redirectIds.slice(0, 500))))
      .returning({ id: redirects.id, from: redirects.fromPath, to: redirects.toPath });
    if (removed.length) {
      await tx.insert(auditEvents).values(
        removed.map((r) => ({
          siteId,
          actorId: userId,
          action: "redirect.deleted",
          targetType: "redirect",
          targetId: r.id,
          metadata: { from: r.from, to: r.to },
        })),
      );
    }
    return removed.length;
  });
}

// ---------------------------------------------------------------------------
// Search visibility
// ---------------------------------------------------------------------------

export async function setSearchVisibility(
  db: DbOrTx,
  userId: string,
  siteId: string,
  allowIndexing: boolean,
) {
  await db.transaction(async (tx) => {
    await requireSeoManager(tx, userId, siteId);
    const [changed] = await tx
      .update(sites)
      .set({ allowIndexing, updatedAt: new Date() })
      .where(and(eq(sites.id, siteId), ne(sites.allowIndexing, allowIndexing)))
      .returning({ id: sites.id });
    if (!changed) return;
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: allowIndexing ? "seo.indexing_allowed" : "seo.indexing_discouraged",
      targetType: "site",
      targetId: siteId,
      metadata: {},
    });
  });
}
