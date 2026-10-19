import { and, asc, count, desc, eq } from "drizzle-orm";
import { generateHTML } from "@tiptap/html/server";
import type { DbOrTx } from "@/server/db";
import { contentEntries, contentModels, redirects, sites, users } from "@/server/db/schema";
import { publishDueEntries } from "@/server/editor";
import { resolveMediaInDoc } from "@/server/media-render";
import {
  docToText,
  EMPTY_DOC,
  richTextExtensions,
  sanitizeDoc,
  type RichTextDoc,
} from "@/lib/editor/rich-text";
import { entryPath, entrySeoSchema, resolveSeo } from "@/lib/seo";

/*
 * Content delivery: what a site's own website reads through the content API.
 * These functions are scoped by a siteId that the caller resolved from an API
 * key (not a user), and only ever return published content.
 */

export interface DeliverySite {
  id: string;
  name: string;
  domain: string | null;
  url: string | null;
  language: string;
  timezone: string;
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
  openGraph: { title: string; description: string };
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
      language: sites.language,
      timezone: sites.timezone,
    })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  return site ? { ...site, url: siteUrl(site.domain) } : null;
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

async function toEntry(db: DbOrTx, row: EntryRow, domain: string | null): Promise<DeliveryEntry> {
  const summary = toSummary(row, domain);
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
      index: seo.index,
      follow: seo.follow,
      robots: `${seo.index ? "index" : "noindex"}, ${seo.follow ? "follow" : "nofollow"}`,
      openGraph: { title: seo.ogTitle, description: seo.ogDescription },
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
  return row ? toEntry(db, row, site.domain) : null;
}

/** "/Posts/Hello/?x=1#top" → "/Posts/Hello". Returns null for anything that isn't a path. */
export function normalizePath(input: string): string | null {
  const path = input.trim().split(/[?#]/)[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 2048) return null;
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
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
