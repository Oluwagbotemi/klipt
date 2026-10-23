import { CalendarRange } from "lucide-react";
import { BarChart, type BarDatum } from "@/components/visual/bar-chart";
import { CardContent, CardHeader, VisualCard } from "@/components/visual/card";
import { CountUp } from "@/components/visual/count-up";
import { DeltaBadge } from "@/components/visual/delta-badge";
import type { OverviewPeriod, PublishingActivity } from "@/lib/overview";
import { cn } from "@/lib/utils";

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const weekdayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
const longDay = (day: string) => weekdayFormat.format(new Date(`${day}T00:00:00Z`));
const plural = (n: number, word: string) => `${n} ${word}`;

/** First publications per day (or week) with the current one in the accent and scheduled posts ahead striped. */
export function PublishingCard({
  activity,
  period,
  href,
}: {
  activity: PublishingActivity;
  period: OverviewPeriod;
  href: string;
}) {
  const weekly = activity.unit === "week";
  const data: BarDatum[] = activity.buckets.map((bucket) => {
    const future = bucket.kind === "future";
    const value = future ? bucket.scheduled : bucket.published;
    return {
      key: bucket.key,
      label: bucket.kind === "current" ? (weekly ? "This week" : "Today") : shortDay(bucket.from),
      longLabel:
        (bucket.kind === "current" ? (weekly ? "This week · " : "Today · ") : "") +
        (weekly ? `${shortDay(bucket.from)} – ${shortDay(bucket.to)}` : longDay(bucket.from)),
      value,
      valueText: future
        ? value
          ? plural(value, "scheduled")
          : "Nothing scheduled"
        : plural(value, "published"),
      kind: bucket.kind,
    };
  });
  const change = activity.thisPeriod - activity.previousPeriod;
  const hasHistory = activity.thisPeriod > 0 || activity.previousPeriod > 0;

  return (
    <VisualCard aria-labelledby="publishing-heading" className="lg:col-span-8">
      <CardHeader
        id="publishing-heading"
        title="Publishing"
        description={`First publications per ${weekly ? "week" : "day"}, with scheduled posts ahead`}
        icon={CalendarRange}
        href={href}
        hrefLabel="Open published content"
      />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CountUp
            value={activity.thisPeriod}
            className="text-[2.5rem] leading-none font-bold tracking-tight"
          />
          <span className="text-muted-foreground text-sm">published in the last {period} days</span>
          {hasHistory && <DeltaBadge value={change} comparedTo={`previous ${period} days`} />}
        </div>
        <ul
          aria-label="Legend"
          className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
        >
          <LegendItem swatch="bg-chart-neutral">Published</LegendItem>
          <LegendItem swatch="bg-primary">{weekly ? "This week" : "Today"}</LegendItem>
          <LegendItem swatch="visual-hatch ring-hatch ring-1 ring-inset">Scheduled</LegendItem>
        </ul>
      </div>
      {/* The chart sits at the bottom; any extra row height goes above it. */}
      <CardContent className="justify-end">
        <BarChart
          data={data}
          title={`Publishing over the last ${period} days and scheduled ahead`}
          className="px-3 pt-8 pb-5 sm:px-4 sm:pb-6"
        />
      </CardContent>
    </VisualCard>
  );
}

function LegendItem({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-[3px]", swatch)} />
      {children}
    </li>
  );
}
