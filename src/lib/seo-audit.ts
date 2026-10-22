import { docToText, type RichTextNode } from "@/lib/editor/rich-text";
import { normalizePath, resolveSeo, SEO_GUIDANCE, type EntrySeoInput } from "@/lib/seo";

/*
 * SEO checks for live (published) pages. Pure functions shared by the
 * Overview and the SEO section. They describe what's on the page; they are
 * recommendations, not ranking predictions, and never block publishing.
 */

export const PAGE_ISSUES = {
  missing_description: {
    title: "No meta description",
    why: "Search engines will pick their own snippet. A short summary usually reads better.",
  },
  long_title: {
    title: "SEO title may be cut off",
    why: `Results usually show about ${SEO_GUIDANCE.title.max} characters.`,
  },
  long_description: {
    title: "Description may be cut off",
    why: `Results usually show about ${SEO_GUIDANCE.description.max} characters.`,
  },
  duplicate_title: {
    title: "Same SEO title as another page",
    why: "Distinct titles help search engines and readers tell pages apart.",
  },
  duplicate_description: {
    title: "Same description as another page",
    why: "Each page usually deserves its own summary.",
  },
  thin_content: {
    title: "Very little text",
    why: "Fewer than 50 words gives search engines and readers little to go on.",
  },
  missing_alt: {
    title: "Images without alt text",
    why: "Screen readers and image search rely on it.",
  },
  broken_links: {
    title: "Links to pages that don't exist",
    why: "Visitors and crawlers hit a dead end. Fix the link or add a redirect.",
  },
  noindex: {
    title: "Hidden from search engines",
    why: "Live, but set to noindex. Check that this is intended.",
  },
} as const;
export type PageIssueKey = keyof typeof PAGE_ISSUES;
export const PAGE_ISSUE_KEYS = Object.keys(PAGE_ISSUES) as PageIssueKey[];

export interface AuditInput {
  id: string;
  title: string;
  slug: string;
  modelKey: string;
  /** Public path under the site's URL patterns. */
  path: string;
  seo: EntrySeoInput;
  body: RichTextNode;
  updatedAt: string;
}

export interface PageAudit {
  id: string;
  title: string;
  path: string;
  modelKey: string;
  seoTitle: string;
  description: string;
  index: boolean;
  inSitemap: boolean;
  /** Why the page isn't in the sitemap, if it isn't. */
  sitemapExclusion: "noindex" | "excluded" | "canonical_elsewhere" | "site_hidden" | null;
  canonicalUrl: string | null;
  words: number;
  images: number;
  imagesMissingAlt: number;
  /** Internal paths this page links to (normalized). */
  links: string[];
  brokenLinks: string[];
  issues: PageIssueKey[];
  updatedAt: string;
}

export interface SiteAudit {
  pages: PageAudit[];
  issueCounts: Record<PageIssueKey, number>;
  /** Live pages no other live page links to. */
  orphans: { id: string; title: string; path: string }[];
  broken: { id: string; title: string; href: string }[];
}

function walk(node: RichTextNode, visit: (node: RichTextNode) => void) {
  visit(node);
  node.content?.forEach((child) => walk(child, visit));
}

/** Internal link targets in a body: site-relative paths and absolute URLs on the site's domain. */
export function internalLinks(body: RichTextNode, domain: string | null): string[] {
  const found = new Set<string>();
  walk(body, (node) => {
    for (const mark of node.marks ?? []) {
      if (mark.type !== "link" || typeof mark.attrs?.href !== "string") continue;
      let href = mark.attrs.href.trim();
      if (domain) {
        const match = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(href);
        if (
          match &&
          match[1].toLowerCase().replace(/^www\./, "") === domain.replace(/^www\./, "")
        ) {
          href = match[2] ?? "/";
        }
      }
      const path = normalizePath(href);
      if (path && !path.startsWith("/media/")) found.add(path);
    }
  });
  return [...found];
}

/**
 * Audits the live pages of a site. `altByMediaId` holds the current alt text
 * of library images; `redirectFrom` the paths that redirect somewhere.
 */
export function auditSite(
  inputs: AuditInput[],
  context: {
    domain: string | null;
    allowIndexing: boolean;
    altByMediaId: Map<string, string>;
    redirectFrom: Set<string>;
  },
): SiteAudit {
  const base = context.domain ? `https://${context.domain}` : null;
  const livePaths = new Set(inputs.map((page) => page.path));

  const pages: PageAudit[] = inputs.map((page) => {
    const path = page.path;
    const seo = resolveSeo(page.seo, page.title || "Untitled");
    let images = 0;
    let imagesMissingAlt = 0;
    walk(page.body, (node) => {
      if (node.type !== "image") return;
      images++;
      const mediaId = node.attrs?.mediaId;
      const alt =
        typeof mediaId === "string"
          ? context.altByMediaId.get(mediaId)
          : String(node.attrs?.alt ?? "");
      if (!alt?.trim()) imagesMissingAlt++;
    });
    const links = internalLinks(page.body, context.domain);
    const brokenLinks = links.filter(
      (link) => link !== "/" && !livePaths.has(link) && !context.redirectFrom.has(link),
    );
    const words = docToText(page.body).split(/\s+/).filter(Boolean).length;
    const ownUrl = base ? `${base}${path}` : null;
    const canonicalElsewhere = Boolean(page.seo.canonicalUrl && page.seo.canonicalUrl !== ownUrl);
    const sitemapExclusion = !context.allowIndexing
      ? "site_hidden"
      : !seo.index
        ? "noindex"
        : !seo.includeInSitemap
          ? "excluded"
          : canonicalElsewhere
            ? "canonical_elsewhere"
            : null;

    const issues: PageIssueKey[] = [];
    if (!seo.description) issues.push("missing_description");
    if (seo.title.length > SEO_GUIDANCE.title.max) issues.push("long_title");
    if (seo.description.length > SEO_GUIDANCE.description.max) issues.push("long_description");
    if (words < 50) issues.push("thin_content");
    if (imagesMissingAlt > 0) issues.push("missing_alt");
    if (brokenLinks.length > 0) issues.push("broken_links");
    if (!seo.index) issues.push("noindex");

    return {
      id: page.id,
      title: page.title || "Untitled",
      path,
      modelKey: page.modelKey,
      seoTitle: seo.title,
      description: seo.description,
      index: seo.index && context.allowIndexing,
      inSitemap: sitemapExclusion === null,
      sitemapExclusion,
      canonicalUrl: page.seo.canonicalUrl || ownUrl,
      words,
      images,
      imagesMissingAlt,
      links,
      brokenLinks,
      issues,
      updatedAt: page.updatedAt,
    };
  });

  // Duplicates across indexable pages.
  const markDuplicates = (key: "seoTitle" | "description", issue: PageIssueKey) => {
    const groups = new Map<string, PageAudit[]>();
    for (const page of pages) {
      const value = page[key].trim().toLowerCase();
      if (!value || !page.index) continue;
      groups.set(value, [...(groups.get(value) ?? []), page]);
    }
    for (const group of groups.values()) {
      if (group.length > 1) group.forEach((page) => page.issues.push(issue));
    }
  };
  markDuplicates("seoTitle", "duplicate_title");
  markDuplicates("description", "duplicate_description");

  const issueCounts = Object.fromEntries(PAGE_ISSUE_KEYS.map((key) => [key, 0])) as Record<
    PageIssueKey,
    number
  >;
  for (const page of pages) for (const issue of page.issues) issueCounts[issue]++;

  const linkedTo = new Set<string>();
  for (const page of pages)
    for (const link of page.links) if (link !== page.path) linkedTo.add(link);
  const orphans = pages
    .filter((page) => !linkedTo.has(page.path))
    .map(({ id, title, path }) => ({ id, title, path }));
  const broken = pages.flatMap((page) =>
    page.brokenLinks.map((href) => ({ id: page.id, title: page.title, href })),
  );

  return { pages, issueCounts, orphans, broken };
}
