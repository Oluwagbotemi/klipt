import type { Metadata } from "next";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PermissionDenied } from "@/components/permission-denied";
import {
  DataSourceNote,
  MetricTile,
  PerformanceFilters,
  perfCard,
  RatingIcon,
} from "@/components/performance/parts";
import { SetupPanel } from "@/components/performance/setup-panel";
import { formatDate } from "@/lib/format";
import { getPerformanceReport, getPerformanceSetup, requestOrigin } from "@/lib/data/performance";
import { getSite } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { CORE_METRICS, formatMetric, METRIC_INFO, parsePerformanceParams } from "@/lib/performance";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Performance" };

/** Core Web Vitals at a glance, or how to start sending them. */
export default async function PerformanceOverviewPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/performance">) {
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
  const [setup, report, origin] = await Promise.all([
    getPerformanceSetup(site.id),
    getPerformanceReport(site.id, device, days),
    requestOrigin(),
  ]);
  const base = siteHref(site.id, "performance");
  const filterQuery = new URLSearchParams({
    ...(device !== "all" ? { device } : {}),
    ...(days !== 28 ? { days: String(days) } : {}),
  }).toString();
  const withFilters = (href: string) => (filterQuery ? `${href}?${filterQuery}` : href);
  const setupPanel = (collapsed: boolean) => (
    <SetupPanel
      siteId={site.id}
      endpoint={`${origin}/api/v1/vitals`}
      setup={setup}
      canManage={can(site.currentUserRole, "performance.manage")}
      domainsHref={siteHref(site.id, "settings", "domains")}
      collapsed={collapsed}
    />
  );

  if (!setup.lastReceivedOn) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
        <EmptyState
          icon={Gauge}
          title="No measurements yet"
          description="Core Web Vitals show how fast your website feels to real visitors. Connect your website below to start collecting them. Klipt never shows estimated numbers."
          className="py-8 sm:py-10"
        />
        {setupPanel(false)}
      </div>
    );
  }

  const core = report.summaries.filter((s) =>
    (CORE_METRICS as readonly string[]).includes(s.metric),
  );
  const other = report.summaries.filter(
    (s) => !(CORE_METRICS as readonly string[]).includes(s.metric),
  );
  const hasData = report.summaries.some((s) => s.samples > 0);
  const worstPages = report.pages.filter((page) => page.worst && page.worst !== "good").slice(0, 5);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PerformanceFilters base={base} device={device} days={days} />
        <p className="text-muted-foreground text-xs">
          Last measurement received {formatDate(setup.lastReceivedOn)}
        </p>
      </div>

      {!hasData ? (
        <p className={`${perfCard} text-muted-foreground px-5 py-6 text-sm`}>
          No visits were measured for this device type in the last {days} days. Try another filter
          or a longer period.
        </p>
      ) : (
        <>
          <section aria-label="Core Web Vitals" className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {core.map((summary) => (
              <MetricTile
                key={summary.metric}
                summary={summary}
                href={`${withFilters(siteHref(site.id, "performance", "web-vitals"))}#${summary.metric.toLowerCase()}`}
              />
            ))}
          </section>
          <section
            aria-label="Other measurements"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {other.map((summary) => (
              <div key={summary.metric} className={`${perfCard} flex flex-col gap-1 p-4`}>
                <p className="text-sm font-medium">
                  {summary.metric}{" "}
                  <span className="text-muted-foreground font-normal">
                    · {METRIC_INFO[summary.metric].name}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-xl font-semibold tabular-nums">
                  {summary.rating && <RatingIcon rating={summary.rating} />}
                  {formatMetric(summary.metric, summary.p75)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {METRIC_INFO[summary.metric].what} Helps explain a slow LCP.
                </p>
              </div>
            ))}
          </section>

          <section aria-labelledby="worst-heading" className={perfCard}>
            <div className="flex flex-wrap items-baseline justify-between gap-3 p-5 pb-3 sm:px-6">
              <h2 id="worst-heading" className="text-base font-semibold">
                Pages to look at first
              </h2>
              <Link
                href={withFilters(siteHref(site.id, "performance", "pages"))}
                className="text-primary text-sm underline-offset-4 hover:underline"
              >
                All {report.pageCount} pages
              </Link>
            </div>
            {worstPages.length === 0 ? (
              <p className="text-muted-foreground border-t px-5 py-5 text-sm sm:px-6">
                Every measured page meets the Core Web Vitals targets.
              </p>
            ) : (
              <ul className="divide-y border-t">
                {worstPages.map((page) => (
                  <li
                    key={page.path}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 sm:px-6"
                  >
                    {page.worst && <RatingIcon rating={page.worst} />}
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block truncate text-sm font-medium">
                        {page.title ?? page.path}
                      </span>
                      {page.title && (
                        <span className="text-muted-foreground block truncate font-mono text-xs">
                          {page.path}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs tabular-nums">
                      {CORE_METRICS.map((metric) => (
                        <span key={metric}>
                          {metric} {formatMetric(metric, page.metrics[metric]?.p75 ?? null)}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <DataSourceNote from={formatDate(report.from)} to={formatDate(report.to)} />
        </>
      )}
      {setupPanel(true)}
    </div>
  );
}
