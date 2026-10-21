import type { Metadata } from "next";
import { PermissionDenied } from "@/components/permission-denied";
import { NotConnected } from "@/components/performance/no-data";
import {
  DataSourceNote,
  PerformanceFilters,
  perfCard,
  RatingBadge,
  ShareBar,
} from "@/components/performance/parts";
import { TrendChart, TrendTable } from "@/components/performance/trend-chart";
import { formatDate } from "@/lib/format";
import { getPerformanceReport } from "@/lib/data/performance";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { formatMetric, METRIC_INFO, parsePerformanceParams } from "@/lib/performance";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Core Web Vitals · Performance" };

/** Each metric's daily trend against Google's thresholds, plus how visits are spread. */
export default async function WebVitalsPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/performance/web-vitals">) {
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">
      <PerformanceFilters
        base={siteHref(site.id, "performance", "web-vitals")}
        device={device}
        days={days}
      />
      {report.summaries.map((summary) => {
        const info = METRIC_INFO[summary.metric];
        const id = summary.metric.toLowerCase();
        return (
          <section
            key={summary.metric}
            id={id}
            aria-labelledby={`${id}-heading`}
            className={`${perfCard} flex scroll-mt-4 flex-col gap-4 p-5 sm:p-6`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-64">
                <h2 id={`${id}-heading`} className="text-base font-semibold">
                  {info.name} ({summary.metric})
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {info.what} Good is {formatMetric(summary.metric, info.good)} or less; poor is
                  over {formatMetric(summary.metric, info.poor)}.{" "}
                  <a
                    href={info.learnMore}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Learn more
                    <span className="sr-only"> about {summary.metric} (opens in a new tab)</span>
                  </a>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <RatingBadge rating={summary.rating} />
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMetric(summary.metric, summary.p75)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {summary.samples.toLocaleString("en")} visits
                </p>
              </div>
            </div>
            {summary.samples === 0 ? (
              <p className="text-muted-foreground text-sm">
                No {summary.metric} measurements in this period.
              </p>
            ) : (
              <>
                <ShareBar shares={summary.shares} />
                <TrendChart metric={summary.metric} points={report.daily[summary.metric]} />
                <TrendTable metric={summary.metric} points={report.daily[summary.metric]} />
              </>
            )}
          </section>
        );
      })}
      <DataSourceNote from={formatDate(report.from)} to={formatDate(report.to)} />
    </div>
  );
}
