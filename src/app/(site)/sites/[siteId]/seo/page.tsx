import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleCheck } from "lucide-react";
import { SiteHiddenNotice, StatTile, TruncatedNote, seoCard } from "@/components/seo/seo-parts";
import { getSeoReport } from "@/lib/data/seo";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { PAGE_ISSUE_KEYS, PAGE_ISSUES } from "@/lib/seo-audit";

export const metadata: Metadata = { title: "SEO" };

export default async function SeoOverviewPage({ params }: PageProps<"/sites/[siteId]/seo">) {
  const { siteId } = await params;
  const [site, report] = await Promise.all([getSite(siteId), getSeoReport(siteId)]);
  const seo = (segment: string, query = "") => `${siteHref(site.id, "seo", segment)}${query}`;
  const issues = PAGE_ISSUE_KEYS.filter((key) => report.issueCounts[key] > 0);
  const live = report.pages.length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">
      {!report.allowIndexing && (
        <SiteHiddenNotice siteId={site.id} canManage={can(site.currentUserRole, "seo.manage")} />
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <li>
          <StatTile label="Live pages" value={live} href={seo("pages")} />
        </li>
        <li>
          <StatTile label="Can appear in search" value={report.indexable} href={seo("pages")} />
        </li>
        <li>
          <StatTile label="In sitemap" value={report.inSitemap} href={seo("sitemap")} />
        </li>
        <li>
          <StatTile label="Redirects" value={report.redirectCount} href={seo("redirects")} />
        </li>
        <li>
          <StatTile
            label="Images without alt text"
            value={report.imagesMissingAlt}
            href={`${siteHref(site.id, "media")}?alt=missing`}
          />
        </li>
      </ul>

      <section aria-labelledby="issues-heading" className={seoCard}>
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 id="issues-heading" className="text-base font-semibold">
            Recommendations for live pages
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Checks of your own content. They&apos;re suggestions: they never block publishing and
            can&apos;t guarantee how search engines rank your pages.
          </p>
        </div>
        {live === 0 ? (
          <p className="text-muted-foreground border-t px-5 py-6 text-sm sm:px-6">
            Nothing is published yet. Recommendations appear once pages are live.
          </p>
        ) : issues.length === 0 ? (
          <p className="flex items-center gap-2 border-t px-5 py-6 text-sm sm:px-6">
            <CircleCheck className="text-success size-5" aria-hidden />
            No recommendations right now.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {issues.map((key) => (
              <li key={key}>
                <Link
                  href={seo(
                    key === "broken_links" ? "links" : "pages",
                    key === "broken_links" ? "" : `?issue=${key}`,
                  )}
                  className="hover:bg-accent/40 focus-visible:ring-ring/50 flex items-center gap-4 px-5 py-3.5 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
                >
                  <span className="bg-muted grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm font-semibold tabular-nums">
                    {report.issueCounts[key]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{PAGE_ISSUES[key].title}</span>
                    <span className="text-muted-foreground block text-sm">
                      {PAGE_ISSUES[key].why}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {report.truncated && <TruncatedNote shown={report.pages.length} />}
    </div>
  );
}
