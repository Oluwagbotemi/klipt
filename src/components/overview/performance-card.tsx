import { CircleCheck, CircleX, Gauge, TriangleAlert } from "lucide-react";
import {
  CardContent,
  CardFooter,
  CardHeader,
  FooterLink,
  VisualCard,
} from "@/components/visual/card";
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
        <>
          <CardContent center className="px-5 pb-6 sm:px-6">
            <Illustration scene="connect" />
            <p className="text-muted-foreground max-w-xs text-sm">
              Not connected. Add Klipt&apos;s reporting code to your website to see how fast it is
              for real visitors.
            </p>
          </CardContent>
          <CardFooter>
            <FooterLink href={href}>Connect</FooterLink>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent className="justify-center px-5 pb-5 sm:px-6">
            <KeyValueList
              className="gap-3.5"
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
            />
          </CardContent>
          <CardFooter>
            <span className="text-muted-foreground">Measured visits (75th percentile)</span>
            <span className="font-semibold tabular-nums">{samples.toLocaleString("en-GB")}</span>
          </CardFooter>
        </>
      )}
    </VisualCard>
  );
}
