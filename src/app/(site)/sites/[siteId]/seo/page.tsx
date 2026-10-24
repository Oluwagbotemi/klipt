import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightLeft,
  ChevronRight,
  FileSearch,
  Globe,
  ImageOff,
  ListChecks,
  Map as MapIcon,
} from "lucide-react";
import { SeoHealthCard } from "@/components/overview/seo-health-card";
import { SiteHiddenNotice, TruncatedNote } from "@/components/seo/seo-parts";
import { CardContent, CardHeader, VisualCard } from "@/components/visual/card";
import { Illustration } from "@/components/visual/illustration";
import { ProgressBar } from "@/components/visual/progress-bar";
import { StatCard } from "@/components/visual/stat-card";
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
  const healthy = report.pages.filter((page) => page.issues.length === 0).length;
  const share = (part: number, label: string) =>
    live > 0 ? <ProgressBar value={part} max={live} label={label} /> : null;

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 sm:px-8">
      {!report.allowIndexing && (
        <SiteHiddenNotice siteId={site.id} canManage={can(site.currentUserRole, "seo.manage")} />
      )}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-6">
        <li className="md:col-span-2">
          <StatCard
            label="Live pages"
            value={live}
            icon={Globe}
            iconTone="accent"
            caption={live === 1 ? "1 published page" : `${live} published pages`}
            href={seo("pages")}
          />
        </li>
        <li className="md:col-span-2">
          <StatCard
            label="Can appear in search"
            value={report.indexable}
            icon={FileSearch}
            iconTone="success"
            caption={live > 0 ? `${report.indexable} of ${live} live` : undefined}
            chart={share(report.indexable, "Live pages that can appear in search")}
            href={seo("pages")}
          />
        </li>
        <li className="md:col-span-2">
          <StatCard
            label="In sitemap"
            value={report.inSitemap}
            icon={MapIcon}
            iconTone="info"
            caption={live > 0 ? `${report.inSitemap} of ${live} live` : undefined}
            chart={share(report.inSitemap, "Live pages in the sitemap")}
            href={seo("sitemap")}
          />
        </li>
        <li className="md:col-span-3">
          <StatCard
            label="Redirects"
            value={report.redirectCount}
            icon={ArrowRightLeft}
            caption="Old addresses sent on"
            href={seo("redirects")}
          />
        </li>
        <li className="col-span-2 md:col-span-3">
          <StatCard
            label="Images without alt text"
            value={report.imagesMissingAlt}
            icon={ImageOff}
            iconTone={report.imagesMissingAlt > 0 ? "warning" : "success"}
            caption={report.imagesMissingAlt > 0 ? "Add a short description" : "All described"}
            href={`${siteHref(site.id, "media")}?alt=missing`}
          />
        </li>
      </ul>

      <div className="grid gap-4 lg:grid-cols-12">
        <VisualCard aria-labelledby="issues-heading" className="lg:col-span-8">
          <CardHeader
            id="issues-heading"
            title="Recommendations for live pages"
            description={
              <>
                Checks of your own content. They&apos;re suggestions: they never block publishing
                and can&apos;t guarantee how search engines rank your pages.
              </>
            }
            icon={ListChecks}
            iconTone="warning"
          />
          {live === 0 ? (
            <CardContent center className="px-5 pb-8 sm:px-6">
              <Illustration scene="content" />
              <p className="text-muted-foreground max-w-72 text-sm">
                Nothing is published yet. Recommendations appear once pages are live.
              </p>
            </CardContent>
          ) : issues.length === 0 ? (
            <CardContent center className="px-5 pb-8 sm:px-6">
              <Illustration scene="success" />
              <p className="text-sm font-medium">No recommendations right now.</p>
              <p className="text-muted-foreground max-w-72 text-sm">
                Every live page passes Klipt&apos;s checks.
              </p>
            </CardContent>
          ) : (
            <CardContent className="gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
              <ul className="flex flex-col gap-2">
                {issues.map((key) => (
                  <li key={key}>
                    <Link
                      href={seo(
                        key === "broken_links" ? "links" : "pages",
                        key === "broken_links" ? "" : `?issue=${key}`,
                      )}
                      className="visual-nested group hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-4 px-4 py-3.5 outline-none focus-visible:ring-[3px]"
                    >
                      <span className="bg-warning-soft text-warning-strong grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm font-semibold tabular-nums">
                        {report.issueCounts[key]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{PAGE_ISSUES[key].title}</span>
                        <span className="text-muted-foreground block text-sm">
                          {PAGE_ISSUES[key].why}
                        </span>
                      </span>
                      <ChevronRight
                        className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </VisualCard>
        <SeoHealthCard
          live={live}
          healthy={healthy}
          allowIndexing={report.allowIndexing}
          href={seo("pages")}
        />
      </div>
      {report.truncated && <TruncatedNote shown={report.pages.length} />}
    </div>
  );
}
