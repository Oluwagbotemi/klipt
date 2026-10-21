import Link from "next/link";
import { RatingIcon } from "@/components/performance/parts";
import { siteHref } from "@/lib/navigation";
import { formatMetric, METRIC_INFO, RATING_LABELS, type MetricSummary } from "@/lib/performance";

/** Core Web Vitals for the last 28 days on the site Overview, or a prompt to connect. */
export function PerformanceCard({
  siteId,
  summary,
}: {
  siteId: string;
  summary: { connected: boolean; summaries: MetricSummary[] };
}) {
  const href = siteHref(siteId, "performance");
  return (
    <section aria-labelledby="performance-heading" className="bg-card rounded-2xl border">
      <div className="flex items-baseline justify-between gap-3 p-5 pb-3 sm:px-6">
        <h2 id="performance-heading" className="text-base font-semibold">
          Core Web Vitals
        </h2>
        <Link href={href} className="text-primary text-sm underline-offset-4 hover:underline">
          {summary.connected ? "Details" : "Connect"}
        </Link>
      </div>
      {!summary.connected ? (
        <p className="text-muted-foreground border-t px-5 py-5 text-sm sm:px-6">
          Not connected. Add Klipt&apos;s reporting code to your website to see how fast it is for
          real visitors.
        </p>
      ) : (
        <>
          <ul className="divide-y border-t">
            {summary.summaries.map((item) => (
              <li
                key={item.metric}
                className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6"
              >
                <span className="min-w-0">
                  {item.metric}{" "}
                  <span className="text-muted-foreground">· {METRIC_INFO[item.metric].short}</span>
                </span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  {item.rating && <RatingIcon rating={item.rating} />}
                  {formatMetric(item.metric, item.p75)}
                  {item.rating && <span className="sr-only">({RATING_LABELS[item.rating]})</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground border-t px-5 py-2.5 text-xs sm:px-6">
            75th percentile of real visits, last 28 days.
          </p>
        </>
      )}
    </section>
  );
}
