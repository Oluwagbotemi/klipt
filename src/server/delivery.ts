import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { generateHTML } from "@tiptap/html/server";
import type { DbOrTx } from "@/server/db";
import {
  contentEntries,
  contentModels,
  mediaAssets,
  redirects,
  sites,
  users,
} from "@/server/db/schema";
import { publishDueEntries } from "@/server/editor";
import { absoluteMediaUrl, resolveMediaInDoc } from "@/server/media-render";
import { verifyPreviewToken } from "@/server/previews";
import {
  docToText,
  EMPTY_DOC,
  richTextExtensions,
  sanitizeDoc,
  type RichTextDoc,
} from "@/lib/editor/rich-text";
import { entryPath, entrySeoSchema, normalizePath, resolveSeo } from "@/lib/seo";
import { applyTitleTemplate } from "@/lib/site-settings";

export { normalizePath };

/*
 * Content delivery: what a site's own website reads through the content API.
 * These functions are scoped by a siteId that the caller resolved from an API
 * key (not a user), and only ever return published content, except
 * getPreviewEntry, which also needs a signed preview token.
 */

export interface DeliverySite {
  id: string;
  name: string;
  domain: string | null;
  url: string | null;
  language: string;
  timezone: string;
  /** False when the site asks search engines not to index anything. */
  allowIndexing: boolean;
  /** e.g. "%s | Northwind Journal", applied to page titles for the <title> tag. */
  titleTemplate: string | null;
  /** Internal: default social image (media id). */
  defaultOgImageId: string | null;
}

export interface DeliveryEntrySummary {
  id: string;
  type: string;
  title: string;
  slug: string;
  path: string;
  /** Absolute URL on the site's domain, or null until a domain is set. */
  url: string | null;
  excerpt: string;
  author: { name: string } | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface DeliverySeo {
  title: string;
  description: string;
  /** The entry's own URL unless a different canonical URL was set. */
  canonicalUrl: string | null;
  index: boolean;
  follow: boolean;
  /** Ready for a robots meta tag, e.g. "noindex, follow". */
  robots: string;
  /** The title with the site's title template applied, for the <title> tag. */
  documentTitle: string;
  openGraph: {
    title: string;
    description: string;
    /** The site's default sharing image, when one is set. */
    image: { url: string; width: number | null; height: number | null; alt: string } | null;
  };
  /** schema.org type of the content model, e.g. "Article". */
  schemaType: string | null;
}

export interface DeliveryEntry extends DeliveryEntrySummary {
  body: { html: string; json: RichTextDoc };
  seo: DeliverySeo;
}

export interface DeliveryList {
  items: DeliveryEntrySummary[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export type ResolveResult =
  | { kind: "entry"; entry: DeliveryEntry }
  | { kind: "redirect"; to: string; statusCode: number }
  | null;

const siteUrl = (domain: string | null) => (domain ? `https://${domain}` : null);

export async function getDeliverySite(db: DbOrTx, siteId: string): Promise<DeliverySite | null> {
  const [site] = await db
    .select({
      id: sites.id,
      name: sites.name,
      domain: sites.domain,
      allowIndexing: sites.allowIndexing,
      language: sites.language,
      timezone: sites.timezone,
      seoDefaults: sites.seoDefaults,
    })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!site) return null;
  const { seoDefaults, ...rest } = site;
  return {
    ...rest,
    url: siteUrl(site.domain),
    titleTemplate: seoDefaults.titleTemplate ?? null,
    defaultOgImageId: seoDefaults.ogImageId ?? null,
  };
}

const entryColumns = {
  entry: contentEntries,
  modelKey: contentModels.key,
  schemaType: contentModels.schemaType,
  authorName: users.name,
};

type EntryRow = {
  entry: typeof contentEntries.$inferSelect;
  modelKey: string;
  schemaType: string | null;
  authorName: string | null;
};

function readBody(data: Record<string, unknown>): RichTextDoc {
  try {
    return data.body ? sanitizeDoc(data.body) : EMPTY_DOC;
  } catch {
    return EMPTY_DOC;
  }
}

function excerptOf(description: string, body: RichTextDoc, max = 200): string {
  if (description) return description;
  const text = docToText(body).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max)}…`;
}

function toSummary(row: EntryRow, domain: string | null): DeliveryEntrySummary {
  const { entry } = row;
  const path = entryPath(row.modelKey, entry.slug);
  const seo = entrySeoSchema.catch({}).parse(entry.seo);
  return {
    id: entry.id,
    type: row.modelKey,
    title: entry.title,
    slug: entry.slug,
    path,
    url: domain ? `${siteUrl(domain)}${path}` : null,
    excerpt: excerptOf(seo.description ?? "", readBody(entry.data)),
    author: row.authorName ? { name: row.authorName } : null,
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

async function defaultOgImage(db: DbOrTx, site: DeliverySite) {
  if (!site.defaultOgImageId) return null;
  const [image] = await db
    .select({
      url: mediaAssets.url,
      width: mediaAssets.width,
      height: mediaAssets.height,
      alt: mediaAssets.altText,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.siteId, site.id), eq(mediaAssets.id, site.defaultOgImageId)))
    .limit(1);
  return image ? { ...image, url: absoluteMediaUrl(image.url), alt: image.alt ?? "" } : null;
}

async function toEntry(db: DbOrTx, row: EntryRow, site: DeliverySite): Promise<DeliveryEntry> {
  const summary = toSummary(row, site.domain);
  const body = await resolveMediaInDoc(db, row.entry.siteId, readBody(row.entry.data), {
    absolute: true,
  });
  const stored = entrySeoSchema.catch({}).parse(row.entry.seo);
  const seo = resolveSeo(stored, row.entry.title);
  return {
    ...summary,
    // Rendered from the sanitized, allow-listed document only.
    body: { html: generateHTML(body, richTextExtensions()), json: body },
    seo: {
      title: seo.title,
      description: seo.description,
      canonicalUrl: stored.canonicalUrl || summary.url,
      // The site-wide switch (SEO › Crawling & indexing) overrides each page.
      index: seo.index && site.allowIndexing,
      follow: seo.follow && site.allowIndexing,
      robots: site.allowIndexing
        ? `${seo.index ? "index" : "noindex"}, ${seo.follow ? "follow" : "nofollow"}`
        : "noindex, nofollow",
      documentTitle: applyTitleTemplate(site.titleTemplate ?? undefined, seo.title),
      openGraph: {
        title: seo.ogTitle,
        description: seo.ogDescription,
        image: await defaultOgImage(db, site),
      },
      schemaType: row.schemaType,
    },
  };
}

function publishedIn(siteId: string) {
  return and(eq(contentEntries.siteId, siteId), eq(contentEntries.status, "published"));
}

function selectEntries(db: DbOrTx) {
  return db
    .select(entryColumns)
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .leftJoin(users, eq(users.id, contentEntries.authorId));
}

/** Published entries, newest first. `type` is a content model key such as "post". */
export async function listPublished(
  db: DbOrTx,
  site: DeliverySite,
  options: { type?: string; page: number; limit: number },
): Promise<DeliveryList> {
  await publishDueEntries(db, site.id);
  const where = and(
    publishedIn(site.id),
    options.type ? eq(contentModels.key, options.type) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    selectEntries(db)
      .where(where)
      .orderBy(desc(contentEntries.publishedAt), asc(contentEntries.id))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db
      .select({ total: count() })
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .where(where),
  ]);
  return {
    items: rows.map((row) => toSummary(row, site.domain)),
    page: options.page,
    limit: options.limit,
    total,
    hasMore: options.page * options.limit < total,
  };
}

export type PreviewResult =
  | {
      ok: true;
      entry: DeliveryEntry & { status: string; preview: { expiresAt: string } };
    }
  | { ok: false; reason: "invalid" | "expired" | "wrong_site" | "not_found" };

/**
 * The one exception to "published only": an entry's current content, for a
 * valid preview token (see src/server/previews.ts) issued for this site.
 * Archived entries are never shown.
 */
export async function getPreviewEntry(
  db: DbOrTx,
  site: DeliverySite,
  token: string,
): Promise<PreviewResult> {
  const verified = verifyPreviewToken(token);
  if (!verified.ok) return { ok: false, reason: verified.reason };
  if (verified.claims.siteId !== site.id) return { ok: false, reason: "wrong_site" };
  const [row] = await selectEntries(db)
    .where(
      and(
        eq(contentEntries.siteId, site.id),
        eq(contentEntries.id, verified.claims.entryId),
        sql`${contentEntries.status} <> 'archived'`,
      ),
    )
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  const entry = await toEntry(db, row, site);
  return {
    ok: true,
    entry: {
      ...entry,
      status: row.entry.status,
      preview: { expiresAt: new Date(verified.claims.exp * 1000).toISOString() },
    },
  };
}

export async function getPublishedEntry(
  db: DbOrTx,
  site: DeliverySite,
  type: string,
  slug: string,
): Promise<DeliveryEntry | null> {
  await publishDueEntries(db, site.id);
  const [row] = await selectEntries(db)
    .where(and(publishedIn(site.id), eq(contentModels.key, type), eq(contentEntries.slug, slug)))
    .limit(1);
  return row ? toEntry(db, row, site) : null;
}

/**
 * What lives at a public path: a published entry, a redirect, or nothing.
 * Lets a website handle every URL with one call, including old URLs.
 */
export async function resolvePath(
  db: DbOrTx,
  site: DeliverySite,
  rawPath: string,
): Promise<ResolveResult> {
  const path = normalizePath(rawPath);
  if (!path) return null;

  // Candidates from the default URL patterns (see entryPath).
  const segments = path.split("/").filter(Boolean);
  const candidates: { type: string; slug: string }[] = [];
  if (segments.length === 1) candidates.push({ type: "page", slug: segments[0] });
  if (segments.length === 2) {
    candidates.push({ type: segments[0] === "posts" ? "post" : segments[0], slug: segments[1] });
  }
  for (const { type, slug } of candidates) {
    if (entryPath(type, slug) !== path) continue;
    const entry = await getPublishedEntry(db, site, type, slug);
    if (entry) return { kind: "entry", entry };
  }

  const [redirect] = await db
    .select({ to: redirects.toPath, statusCode: redirects.statusCode })
    .from(redirects)
    .where(and(eq(redirects.siteId, site.id), eq(redirects.fromPath, path)))
    .limit(1);
  return redirect ? { kind: "redirect", ...redirect } : null;
}

export async function listRedirects(db: DbOrTx, siteId: string) {
  return db
    .select({ from: redirects.fromPath, to: redirects.toPath, statusCode: redirects.statusCode })
    .from(redirects)
    .where(eq(redirects.siteId, siteId))
    .orderBy(asc(redirects.fromPath));
}

/**
 * Published entries that belong in the XML sitemap: indexable, not excluded,
 * and not pointing their canonical URL somewhere else.
 */
export async function listSitemap(db: DbOrTx, site: DeliverySite) {
  if (!site.allowIndexing) return [];
  await publishDueEntries(db, site.id);
  const rows = await db
    .select({
      slug: contentEntries.slug,
      seo: contentEntries.seo,
      title: contentEntries.title,
      updatedAt: contentEntries.updatedAt,
      modelKey: contentModels.key,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(publishedIn(site.id))
    .orderBy(asc(contentModels.key), asc(contentEntries.slug));

  const base = siteUrl(site.domain);
  return rows.flatMap((row) => {
    const stored = entrySeoSchema.catch({}).parse(row.seo);
    if (!resolveSeo(stored, row.title).includeInSitemap) return [];
    const path = entryPath(row.modelKey, row.slug);
    const url = base ? `${base}${path}` : null;
    if (stored.canonicalUrl && stored.canonicalUrl !== url) return [];
    return [{ path, url, lastModified: row.updatedAt.toISOString() }];
  });
}
