import { and, asc, count, desc, eq, exists, inArray, max, sql } from "drizzle-orm";
import { generateHTML } from "@tiptap/html/server";
import type { DbOrTx } from "@/server/db";
import {
  contentEntries,
  contentModels,
  entryTerms,
  mediaAssets,
  redirects,
  sites,
  taxonomies,
  terms,
  users,
  type ContentFieldDefinition,
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
import { readFieldValues } from "@/lib/models";
import { entrySeoSchema, normalizePath, resolveSeo } from "@/lib/seo";
import { entryDate, entryPath, matchPath, type PathRules } from "@/lib/url-patterns";
import { applyTitleTemplate } from "@/lib/site-settings";
import { appliesTo, descendantIds, termPath } from "@/lib/taxonomy";

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
  /** Internal: URL patterns (Settings › Publishing) every path is built from. */
  pathRules: PathRules;
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
  /** The content type's own fields; every field is present, `null` when empty. */
  fields: Record<string, DeliveryFieldValue>;
  /** Terms by taxonomy key; every taxonomy the type uses is present, `[]` when none. */
  taxonomies: Record<string, DeliveryTerm[]>;
}

export interface DeliveryTerm {
  name: string;
  slug: string;
  /** Archive path on the site, e.g. /category/news. */
  path: string;
}

export type DeliveryFieldValue =
  | string
  | number
  | boolean
  | null
  | { url: string; alt: string; width: number | null; height: number | null }
  | { id: string; type: string; title: string; slug: string; path: string };

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
  | { kind: "term"; taxonomy: string; term: DeliveryTerm }
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
      urlPatterns: sites.urlPatterns,
    })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!site) return null;
  const { seoDefaults, urlPatterns, ...rest } = site;
  return {
    ...rest,
    pathRules: { patterns: urlPatterns ?? {}, timeZone: site.timezone },
    url: siteUrl(site.domain),
    titleTemplate: seoDefaults.titleTemplate ?? null,
    defaultOgImageId: seoDefaults.ogImageId ?? null,
  };
}

const entryColumns = {
  entry: contentEntries,
  modelKey: contentModels.key,
  schemaType: contentModels.schemaType,
  modelFields: contentModels.fields,
  authorName: users.name,
};

type EntryRow = {
  entry: typeof contentEntries.$inferSelect;
  modelKey: string;
  schemaType: string | null;
  modelFields: ContentFieldDefinition[];
  authorName: string | null;
};

type FieldMap = Map<string, Record<string, DeliveryFieldValue>>;
type TermMap = Map<string, Record<string, DeliveryTerm[]>>;

/** Each entry's terms, grouped by taxonomy key (taxonomies its type uses only). */
async function resolveTerms(db: DbOrTx, siteId: string, rows: EntryRow[]): Promise<TermMap> {
  const out: TermMap = new Map();
  if (rows.length === 0) return out;
  const [all, assigned] = await Promise.all([
    db
      .select({
        key: taxonomies.key,
        isSystem: taxonomies.isSystem,
        modelKeys: taxonomies.modelKeys,
      })
      .from(taxonomies)
      .where(eq(taxonomies.siteId, siteId))
      .orderBy(desc(taxonomies.isSystem), asc(taxonomies.key)),
    db
      .select({
        entryId: entryTerms.entryId,
        key: taxonomies.key,
        name: terms.name,
        slug: terms.slug,
      })
      .from(entryTerms)
      .innerJoin(terms, eq(terms.id, entryTerms.termId))
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(
        and(
          eq(entryTerms.siteId, siteId),
          inArray(
            entryTerms.entryId,
            rows.map((row) => row.entry.id),
          ),
        ),
      )
      .orderBy(asc(terms.name)),
  ]);
  for (const row of rows) {
    const groups: Record<string, DeliveryTerm[]> = {};
    for (const taxonomy of all) {
      if (appliesTo(taxonomy, row.modelKey)) groups[taxonomy.key] = [];
    }
    out.set(row.entry.id, groups);
  }
  for (const term of assigned) {
    out.get(term.entryId)?.[term.key]?.push({
      name: term.name,
      slug: term.slug,
      path: termPath(term.key, term.slug),
    });
  }
  return out;
}

/**
 * Field values for a batch of entries, with images resolved to absolute URLs
 * and links resolved to the linked entry. Links to anything that isn't
 * published (or images that were deleted) come back as null.
 */
async function resolveFields(db: DbOrTx, site: DeliverySite, rows: EntryRow[]): Promise<FieldMap> {
  const siteId = site.id;
  const stored = rows.map((row) => ({
    row,
    values: readFieldValues(row.modelFields, row.entry.data),
  }));
  const idsOf = (type: ContentFieldDefinition["type"]) => [
    ...new Set(
      stored.flatMap(({ row, values }) =>
        row.modelFields
          .filter((field) => field.type === type && typeof values[field.key] === "string")
          .map((field) => String(values[field.key])),
      ),
    ),
  ];
  const mediaIds = idsOf("media");
  const entryIds = idsOf("reference");
  const [media, linked] = await Promise.all([
    mediaIds.length
      ? db
          .select()
          .from(mediaAssets)
          .where(and(eq(mediaAssets.siteId, siteId), inArray(mediaAssets.id, mediaIds)))
      : [],
    entryIds.length
      ? db
          .select({
            id: contentEntries.id,
            title: contentEntries.title,
            slug: contentEntries.slug,
            modelKey: contentModels.key,
            publishedAt: contentEntries.publishedAt,
          })
          .from(contentEntries)
          .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
          .where(and(publishedIn(siteId), inArray(contentEntries.id, entryIds)))
      : [],
  ]);
  const mediaById = new Map(media.map((asset) => [asset.id, asset]));
  const entryById = new Map(linked.map((entry) => [entry.id, entry]));

  const out: FieldMap = new Map();
  for (const { row, values } of stored) {
    const fields: Record<string, DeliveryFieldValue> = {};
    for (const field of row.modelFields) {
      const value = values[field.key];
      if (value === undefined) {
        fields[field.key] = null;
      } else if (field.type === "media") {
        const asset = mediaById.get(String(value));
        fields[field.key] = asset
          ? {
              url: absoluteMediaUrl(asset.url),
              alt: asset.altText ?? "",
              width: asset.width,
              height: asset.height,
            }
          : null;
      } else if (field.type === "reference") {
        const target = entryById.get(String(value));
        fields[field.key] = target
          ? {
              id: target.id,
              type: target.modelKey,
              title: target.title,
              slug: target.slug,
              path: entryPath(site.pathRules, target.modelKey, target.slug, target.publishedAt),
            }
          : null;
      } else {
        fields[field.key] = value;
      }
    }
    out.set(row.entry.id, fields);
  }
  return out;
}

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

function toSummary(
  row: EntryRow,
  site: DeliverySite,
  fields: FieldMap,
  taxonomyTerms: TermMap,
): DeliveryEntrySummary {
  const { entry } = row;
  const domain = site.domain;
  const path = entryPath(site.pathRules, row.modelKey, entry.slug, entryDate(entry));
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
    fields: fields.get(entry.id) ?? {},
    taxonomies: taxonomyTerms.get(entry.id) ?? {},
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
  const [fields, taxonomyTerms] = await Promise.all([
    resolveFields(db, site, [row]),
    resolveTerms(db, site.id, [row]),
  ]);
  const summary = toSummary(row, site, fields, taxonomyTerms);
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

export interface TermFilter {
  taxonomy: string;
  slug: string;
}

/**
 * Turns term filters into term id sets: an entry matches a filter when it
 * has the term or, in nested taxonomies, one of its children. Returns the
 * filter that names an unknown taxonomy or term, if any.
 */
export async function resolveTermFilters(
  db: DbOrTx,
  siteId: string,
  filters: TermFilter[],
): Promise<{ ok: true; termSets: string[][] } | { ok: false; filter: TermFilter }> {
  const termSets: string[][] = [];
  for (const filter of filters) {
    const [taxonomy] = await db
      .select({ id: taxonomies.id, hierarchical: taxonomies.hierarchical })
      .from(taxonomies)
      .where(and(eq(taxonomies.siteId, siteId), eq(taxonomies.key, filter.taxonomy)))
      .limit(1);
    if (!taxonomy) return { ok: false, filter };
    const all = await db
      .select({ id: terms.id, slug: terms.slug, parentId: terms.parentId })
      .from(terms)
      .where(eq(terms.taxonomyId, taxonomy.id));
    const term = all.find((item) => item.slug === filter.slug);
    if (!term) return { ok: false, filter };
    termSets.push(taxonomy.hierarchical ? [...descendantIds(all, term.id)] : [term.id]);
  }
  return { ok: true, termSets };
}

function hasAnyTerm(db: DbOrTx, termIds: string[]) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(entryTerms)
      .where(and(eq(entryTerms.entryId, contentEntries.id), inArray(entryTerms.termId, termIds))),
  );
}

/**
 * Published entries, newest first. `type` is a content model key such as
 * "post"; each of `termSets` (from resolveTermFilters) must match.
 */
export async function listPublished(
  db: DbOrTx,
  site: DeliverySite,
  options: { type?: string; termSets?: string[][]; page: number; limit: number },
): Promise<DeliveryList> {
  await publishDueEntries(db, site.id);
  const where = and(
    publishedIn(site.id),
    options.type ? eq(contentModels.key, options.type) : undefined,
    ...(options.termSets ?? []).map((ids) => hasAnyTerm(db, ids)),
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
  const [fields, taxonomyTerms] = await Promise.all([
    resolveFields(db, site, rows),
    resolveTerms(db, site.id, rows),
  ]);
  return {
    items: rows.map((row) => toSummary(row, site, fields, taxonomyTerms)),
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

  // Content types whose URL pattern fits the path (see src/lib/url-patterns.ts).
  const segments = path.split("/").filter(Boolean);
  const models = await db
    .select({ key: contentModels.key })
    .from(contentModels)
    .where(eq(contentModels.siteId, site.id));
  const candidates = matchPath(
    site.pathRules,
    models.map((model) => model.key),
    path,
  );
  for (const { modelKey, slug } of candidates) {
    const entry = await getPublishedEntry(db, site, modelKey, slug);
    // Date parts ({yyyy}/{mm}) must match the entry's own date too.
    if (entry && entry.path === path) return { kind: "entry", entry };
  }

  // Term archive pages: /category/news, /tag/seo, /region/europe.
  if (segments.length === 2) {
    const [term] = await db
      .select({ name: terms.name, slug: terms.slug, key: taxonomies.key })
      .from(terms)
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(
        and(
          eq(taxonomies.siteId, site.id),
          eq(taxonomies.key, segments[0]),
          eq(terms.slug, segments[1]),
        ),
      )
      .limit(1);
    if (term) {
      return {
        kind: "term",
        taxonomy: term.key,
        term: { name: term.name, slug: term.slug, path: termPath(term.key, term.slug) },
      };
    }
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
      publishedAt: contentEntries.publishedAt,
      modelKey: contentModels.key,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(publishedIn(site.id))
    .orderBy(asc(contentModels.key), asc(contentEntries.slug));

  const base = siteUrl(site.domain);
  const entries = rows.flatMap((row) => {
    const stored = entrySeoSchema.catch({}).parse(row.seo);
    if (!resolveSeo(stored, row.title).includeInSitemap) return [];
    const path = entryPath(site.pathRules, row.modelKey, row.slug, row.publishedAt);
    const url = base ? `${base}${path}` : null;
    if (stored.canonicalUrl && stored.canonicalUrl !== url) return [];
    return [{ kind: "entry" as const, path, url, lastModified: row.updatedAt.toISOString() }];
  });
  const archives = (await listTermArchives(db, site.id)).map((row) => {
    const path = termPath(row.key, row.slug);
    return {
      kind: "term" as const,
      path,
      url: base ? `${base}${path}` : null,
      lastModified: row.lastModified ? new Date(row.lastModified).toISOString() : null,
    };
  });
  return [...entries, ...archives];
}

export interface DeliveryTermNode extends DeliveryTerm {
  description: string | null;
  seo: { title: string; description: string };
  /**
   * Published entries `?<taxonomy>=<slug>` returns: with the term or, in
   * nested taxonomies, any term below it.
   */
  count: number;
  /** Nested taxonomies only. */
  children?: DeliveryTermNode[];
}

/** Published entry ids per term (direct assignments only). */
async function publishedTermEntries(db: DbOrTx, siteId: string, taxonomyId?: string) {
  const rows = await db
    .select({ termId: entryTerms.termId, entryId: entryTerms.entryId })
    .from(entryTerms)
    .innerJoin(contentEntries, eq(contentEntries.id, entryTerms.entryId))
    .innerJoin(terms, eq(terms.id, entryTerms.termId))
    .where(and(publishedIn(siteId), taxonomyId ? eq(terms.taxonomyId, taxonomyId) : undefined));
  const byTerm = new Map<string, Set<string>>();
  for (const row of rows) {
    byTerm.set(row.termId, (byTerm.get(row.termId) ?? new Set()).add(row.entryId));
  }
  return byTerm;
}

/** A taxonomy's terms with published-entry counts; a tree for nested taxonomies. */
export async function listTaxonomyTerms(db: DbOrTx, site: DeliverySite, key: string) {
  await publishDueEntries(db, site.id);
  const [taxonomy] = await db
    .select()
    .from(taxonomies)
    .where(and(eq(taxonomies.siteId, site.id), eq(taxonomies.key, key)))
    .limit(1);
  if (!taxonomy) return null;
  const [all, byTerm] = await Promise.all([
    db.select().from(terms).where(eq(terms.taxonomyId, taxonomy.id)).orderBy(asc(terms.name)),
    publishedTermEntries(db, site.id, taxonomy.id),
  ]);
  const ids = new Set(all.map((term) => term.id));

  const build = (term: (typeof all)[number], seen: Set<string>): DeliveryTermNode => {
    const entries = new Set(byTerm.get(term.id));
    const node: DeliveryTermNode = {
      name: term.name,
      slug: term.slug,
      path: termPath(taxonomy.key, term.slug),
      description: term.description,
      seo: { title: term.seoTitle || term.name, description: term.seoDescription || "" },
      count: 0,
    };
    if (taxonomy.hierarchical) {
      node.children = all
        .filter((child) => child.parentId === term.id && !seen.has(child.id))
        .map((child) => {
          const sub = build(child, new Set(seen).add(child.id));
          for (const id of descendantIds(all, child.id)) {
            for (const entryId of byTerm.get(id) ?? []) entries.add(entryId);
          }
          return sub;
        });
    }
    node.count = entries.size;
    return node;
  };
  const roots = taxonomy.hierarchical
    ? all.filter((term) => !term.parentId || !ids.has(term.parentId))
    : all;
  return {
    taxonomy: { key: taxonomy.key, name: taxonomy.name, hierarchical: taxonomy.hierarchical },
    terms: roots.map((term) => build(term, new Set([term.id]))),
  };
}

/**
 * Term archive pages (/category/news, /tag/seo, …) for the sitemap: only
 * terms with at least one published entry, last modified when the newest of
 * those entries was.
 */
async function listTermArchives(db: DbOrTx, siteId: string) {
  return db
    .select({
      key: taxonomies.key,
      slug: terms.slug,
      lastModified: max(contentEntries.updatedAt),
    })
    .from(entryTerms)
    .innerJoin(contentEntries, eq(contentEntries.id, entryTerms.entryId))
    .innerJoin(terms, eq(terms.id, entryTerms.termId))
    .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
    .where(publishedIn(siteId))
    .groupBy(taxonomies.key, terms.slug)
    .orderBy(asc(taxonomies.key), asc(terms.slug));
}
