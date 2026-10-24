import type { Metadata } from "next";
import Link from "next/link";
import { EmptyCard } from "@/components/insights/parts";
import { PermissionDenied } from "@/components/permission-denied";
import { NotConnected } from "@/components/performance/no-data";
import {
  DataSourceNote,
  PerformanceFilters,
  perfCard,
  RatingIcon,
} from "@/components/performance/parts";
import { InfoChip } from "@/components/visual/info-chip";
import { formatDate } from "@/lib/format";
import { getPerformanceReport } from "@/lib/data/performance";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import {
  CORE_METRICS,
  formatMetric,
  LOW_SAMPLE,
  OTHER_PATH,
  PAGE_LIMIT,
  parsePerformanceParams,
  RATING_LABELS,
} from "@/lib/performance";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Pages · Performance" };

/** Every measured page with its Core Web Vitals, worst first. */
export default async function PerformancePagesPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/performance/pages">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const site = await getSite(siteId);
  if (!can(site.currentUserRole, "performance.view")) {
    return (
      <PermissionDenied
        area="Performance"
        role={site.currentUserRole}
        backHref={siteHref(site.id)}
      />
    );
  }
  const { device, days } = parsePerformanceParams(query);
  const report = await getPerformanceReport(site.id, device, days);
  if (!report.lastReceivedOn) {
    return <NotConnected overviewHref={siteHref(site.id, "performance")} />;
  }
  const entryHref = (id: string) => `${siteHref(site.id, "content")}/${id}`;

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-8">
      <PerformanceFilters
        base={siteHref(site.id, "performance", "pages")}
        device={device}
        days={days}
      />
      {report.pages.length === 0 ? (
        <EmptyCard
          scene="activity"
          title="No pages measured in this period"
          description="Try another device type or a longer period."
        />
      ) : (
        <div className={`${perfCard} overflow-hidden`}>
          <div className="text-muted-foreground border-card-border bg-muted/40 hidden grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)_5.5rem] gap-4 border-b px-5 py-2 text-xs font-medium md:grid">
            <span>Page</span>
            {CORE_METRICS.map((metric) => (
              <span key={metric} className="text-right">
                {metric}
              </span>
            ))}
            <span className="text-right">Visits</span>
          </div>
          <ul className="divide-card-border divide-y" aria-label="Measured pages">
            {report.pages.map((page) => {
              const label =
                page.path === OTHER_PATH
                  ? "Other pages (over the daily page limit)"
                  : (page.title ?? page.path);
              return (
                <li
                  key={page.path}
                  className="grid grid-cols-1 gap-2 px-5 py-3 md:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)_5.5rem] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    {page.entryId ? (
                      <Link
                        href={entryHref(page.entryId)}
                        className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm font-medium">{label}</span>
                    )}
                    <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                      {page.title && <span className="truncate font-mono">{page.path}</span>}
                      {!page.entryId && page.path !== OTHER_PATH && <span>Not a Klipt page</span>}
                      {page.samples < LOW_SAMPLE && (
                        <InfoChip tone="warning" className="h-5 px-2">
                          Few visits
                        </InfoChip>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 md:contents">
                    {CORE_METRICS.map((metric) => {
                      const value = page.metrics[metric];
                      return (
                        <span
                          key={metric}
                          className="flex items-center gap-1.5 text-sm tabular-nums md:justify-end"
                        >
                          <span className="text-muted-foreground text-xs md:hidden">{metric}</span>
                          {value ? (
                            <>
                              <RatingIcon rating={value.rating} />
                              <span>{formatMetric(metric, value.p75)}</span>
                              <span className="sr-only">({RATING_LABELS[value.rating]})</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </span>
                      );
                    })}
                    <span className="text-muted-foreground text-sm tabular-nums md:text-right">
                      <span className="text-xs md:hidden">Visits </span>
                      {page.samples.toLocaleString("en")}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {report.pageCount > PAGE_LIMIT && (
        <p className="text-muted-foreground text-xs">
          Showing the {PAGE_LIMIT} pages that need the most work, of {report.pageCount} measured.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Pages with fewer than {LOW_SAMPLE} visits are marked &ldquo;Few visits&rdquo;: a handful of
        slow visits can swing their numbers a lot.
      </p>
      <DataSourceNote from={formatDate(report.from)} to={formatDate(report.to)} />
    </div>
  );
}
