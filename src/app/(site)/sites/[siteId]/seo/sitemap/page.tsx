import type { Metadata } from "next";
import Link from "next/link";
import { FileX2, Map as MapIcon } from "lucide-react";
import { SiteHiddenNotice, TruncatedNote } from "@/components/seo/seo-parts";
import { CardContent, CardHeader, VisualCard } from "@/components/visual/card";
import { Illustration } from "@/components/visual/illustration";
import { InfoChip } from "@/components/visual/info-chip";
import { ProgressBar } from "@/components/visual/progress-bar";
import { StatCard } from "@/components/visual/stat-card";
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
    <div className="flex w-full flex-col gap-5 px-4 py-6 sm:px-8">
      {!report.allowIndexing && (
        <SiteHiddenNotice siteId={site.id} canManage={can(site.currentUserRole, "seo.manage")} />
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="In the sitemap"
          value={included.length}
          icon={MapIcon}
          iconTone="info"
          caption={
            report.pages.length > 0
              ? `${included.length} of ${report.pages.length} live`
              : undefined
          }
          chart={
            report.pages.length > 0 ? (
              <ProgressBar
                value={included.length}
                max={report.pages.length}
                label="Live pages in the sitemap"
              />
            ) : null
          }
        />
        <StatCard
          label="Left out"
          value={excluded.length}
          icon={FileX2}
          iconTone={excluded.length > 0 ? "warning" : "neutral"}
          caption={excluded.length > 0 ? "Noindex, excluded or canonical" : "Nothing left out"}
        />
        <VisualCard aria-labelledby="sitemap-about" className="col-span-2">
          <CardHeader
            id="sitemap-about"
            title="How your sitemap works"
            description={
              <>
                A sitemap lists the pages you want search engines to find. Klipt builds the list
                from your live pages; your website publishes it as{" "}
                <code className="font-mono">sitemap.xml</code> by reading{" "}
                <code className="font-mono">GET /api/v1/sitemap</code> (see Settings ›
                Integrations). Pages that are noindex, excluded, or canonical to another address are
                left out automatically.
              </>
            }
          />
        </VisualCard>
      </div>

      <VisualCard aria-labelledby="included-heading">
        <CardHeader
          id="included-heading"
          title="In the sitemap"
          icon={MapIcon}
          iconTone="info"
          action={<InfoChip tone="info">{included.length}</InfoChip>}
        />
        {included.length === 0 ? (
          <CardContent center className="px-5 pb-8 sm:px-6">
            <Illustration scene="content" className="h-20" />
            <p className="text-muted-foreground text-sm">No pages are in the sitemap yet.</p>
          </CardContent>
        ) : (
          <ul
            className="divide-card-border border-card-border divide-y border-t"
            aria-label="Pages in the sitemap"
          >
            {included.map((page) => (
              <li key={page.id}>
                <Link
                  href={entryHref(page.id)}
                  className="hover:bg-accent/50 focus-visible:ring-ring/50 flex items-center gap-3 px-5 py-2.5 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
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
      </VisualCard>

      {excluded.length > 0 && (
        <VisualCard aria-labelledby="excluded-heading">
          <CardHeader
            id="excluded-heading"
            title="Left out"
            description="Live pages that aren't in the sitemap, and why. Change this in each page's SEO settings."
            icon={FileX2}
            iconTone="warning"
            action={<InfoChip tone="warning">{excluded.length}</InfoChip>}
          />
          <ul
            className="divide-card-border border-card-border divide-y border-t"
            aria-label="Pages left out of the sitemap"
          >
            {excluded.map((page) => (
              <li key={page.id}>
                <Link
                  href={entryHref(page.id)}
                  className="hover:bg-accent/50 focus-visible:ring-ring/50 block px-5 py-2.5 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
                >
                  <span className="block truncate text-sm font-medium">{page.title}</span>
                  <span className="text-warning-strong block text-xs">
                    {page.sitemapExclusion && REASONS[page.sitemapExclusion]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </VisualCard>
      )}
      {report.truncated && <TruncatedNote shown={report.pages.length} />}
    </div>
  );
}
