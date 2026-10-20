import type { Metadata } from "next";
import Link from "next/link";
import { SiteHiddenNotice, TruncatedNote, seoCard } from "@/components/seo/seo-parts";
import { getSeoReport } from "@/lib/data/seo";
import { getSite } from "@/lib/data/sites";
import { formatDate } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import type { PageAudit } from "@/lib/seo-audit";

export const metadata: Metadata = { title: "Sitemap · SEO" };

const REASONS: Record<NonNullable<PageAudit["sitemapExclusion"]>, string> = {
  site_hidden: "Whole site hidden from search engines",
  noindex: "Set to noindex",
  excluded: "Excluded from the sitemap in its SEO settings",
  canonical_elsewhere: "Canonical URL points to another address",
};

export default async function SeoSitemapPage({ params }: PageProps<"/sites/[siteId]/seo/sitemap">) {
  const { siteId } = await params;
  const [site, report] = await Promise.all([getSite(siteId), getSeoReport(siteId)]);
  const included = report.pages.filter((page) => page.inSitemap);
  const excluded = report.pages.filter((page) => !page.inSitemap);
  const entryHref = (id: string) => `${siteHref(site.id, "content")}/${id}`;
  const domain = report.domain ? `https://${report.domain}` : "";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">
      {!report.allowIndexing && (
        <SiteHiddenNotice siteId={site.id} canManage={can(site.currentUserRole, "seo.manage")} />
      )}
      <section aria-labelledby="sitemap-about" className={`${seoCard} p-5 sm:p-6`}>
        <h2 id="sitemap-about" className="text-base font-semibold">
          How your sitemap works
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          A sitemap lists the pages you want search engines to find. Klipt builds the list from your
          live pages; your website publishes it as <code className="font-mono">sitemap.xml</code> by
          reading <code className="font-mono">GET /api/v1/sitemap</code> (see Settings ›
          Integrations). Pages that are noindex, excluded, or canonical to another address are left
          out automatically.
        </p>
      </section>

      <section aria-labelledby="included-heading" className={seoCard}>
        <h2 id="included-heading" className="p-5 pb-3 text-base font-semibold sm:px-6">
          In the sitemap{" "}
          <span className="text-muted-foreground font-normal">({included.length})</span>
        </h2>
        {included.length === 0 ? (
          <p className="text-muted-foreground border-t px-5 py-6 text-sm sm:px-6">
            No pages are in the sitemap yet.
          </p>
        ) : (
          <ul className="divide-y border-t" aria-label="Pages in the sitemap">
            {included.map((page) => (
              <li key={page.id}>
                <Link
                  href={entryHref(page.id)}
                  className="hover:bg-accent/40 focus-visible:ring-ring/50 flex items-center gap-3 px-5 py-2.5 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">
                    {domain}
                    {page.path}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    Updated {formatDate(page.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {excluded.length > 0 && (
        <section aria-labelledby="excluded-heading" className={seoCard}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <h2 id="excluded-heading" className="text-base font-semibold">
              Left out{" "}
              <span className="text-muted-foreground font-normal">({excluded.length})</span>
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Live pages that aren&apos;t in the sitemap, and why. Change this in each page&apos;s
              SEO settings.
            </p>
          </div>
          <ul className="divide-y border-t" aria-label="Pages left out of the sitemap">
            {excluded.map((page) => (
              <li key={page.id}>
                <Link
                  href={entryHref(page.id)}
                  className="hover:bg-accent/40 focus-visible:ring-ring/50 block px-5 py-2.5 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
                >
                  <span className="block truncate text-sm font-medium">{page.title}</span>
                  <span className="text-muted-foreground block text-xs">
                    {page.sitemapExclusion && REASONS[page.sitemapExclusion]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.truncated && <TruncatedNote shown={report.pages.length} />}
    </div>
  );
}
