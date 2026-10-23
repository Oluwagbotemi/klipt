import Link from "next/link";
import { CircleCheck, CircleX, Gauge, TriangleAlert } from "lucide-react";
import { CardHeader, VisualCard } from "@/components/visual/card";
import { InfoChip, type ChipTone } from "@/components/visual/info-chip";
import { Illustration } from "@/components/visual/illustration";
import { KeyValueList } from "@/components/visual/key-value-list";
import { siteHref } from "@/lib/navigation";
import {
  formatMetric,
  METRIC_INFO,
  RATING_LABELS,
  type MetricSummary,
  type Rating,
} from "@/lib/performance";

const RATING_TONE: Record<Rating, ChipTone> = {
  good: "success",
  "needs-improvement": "warning",
  poor: "danger",
};
const RATING_ICON = { good: CircleCheck, "needs-improvement": TriangleAlert, poor: CircleX };

/** Core Web Vitals for the last 28 days on the site Overview, or a prompt to connect. */
export function PerformanceCard({
  siteId,
  summary,
}: {
  siteId: string;
  summary: { connected: boolean; summaries: MetricSummary[] };
}) {
  const href = siteHref(siteId, "performance");
  const samples = Math.max(0, ...summary.summaries.map((item) => item.samples));
  return (
    <VisualCard aria-labelledby="performance-heading">
      <CardHeader
        id="performance-heading"
        title="Core Web Vitals"
        description={summary.connected ? "Real visits, last 28 days" : undefined}
        icon={Gauge}
        href={href}
        hrefLabel={summary.connected ? "Performance details" : "Connect performance reporting"}
      />
      {!summary.connected ? (
        <div className="flex flex-col items-center gap-3 px-5 pb-6 text-center sm:px-6">
          <Illustration scene="connect" />
          <p className="text-muted-foreground max-w-xs text-sm">
            Not connected. Add Klipt&apos;s reporting code to your website to see how fast it is for
            real visitors.
          </p>
          <Link
            href={href}
            className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          >
            Connect
          </Link>
        </div>
      ) : (
        <KeyValueList
          className="px-5 pb-5 sm:px-6 sm:pb-6"
          items={summary.summaries.map((item) => ({
            key: item.metric,
            label: (
              <>
                <span className="text-foreground font-medium">{item.metric}</span> ·{" "}
                {METRIC_INFO[item.metric].short}
              </>
            ),
            value: item.rating ? (
              <InfoChip
                tone={RATING_TONE[item.rating]}
                icon={RATING_ICON[item.rating]}
                className="tabular-nums"
              >
                {formatMetric(item.metric, item.p75)}
                <span className="sr-only"> ({RATING_LABELS[item.rating]})</span>
              </InfoChip>
            ) : (
              formatMetric(item.metric, item.p75)
            ),
          }))}
          total={{
            label: "Measured visits (75th percentile)",
            value: samples.toLocaleString("en-GB"),
          }}
        />
      )}
    </VisualCard>
  );
}
