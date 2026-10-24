import Link from "next/link";
import { CircleAlert, CircleCheck, CircleX, type LucideIcon } from "lucide-react";
import { InfoChip, type ChipTone } from "@/components/visual/info-chip";
import {
  formatMetric,
  LOW_SAMPLE,
  METRIC_INFO,
  RATING_LABELS,
  type DeviceFilter,
  type MetricSummary,
  type Period,
  type Rating,
} from "@/lib/performance";
import { cn } from "@/lib/utils";
import { AreaChart } from "@/components/visual/area-chart";

export const perfCard = "visual-card";

const RATING_STYLE: Record<
  Rating,
  { icon: LucideIcon; tone: ChipTone; text: string; fill: string }
> = {
  good: { icon: CircleCheck, tone: "success", text: "text-success-strong", fill: "bg-success" },
  "needs-improvement": {
    icon: CircleAlert,
    tone: "warning",
    text: "text-warning-strong",
    fill: "bg-warning",
  },
  poor: { icon: CircleX, tone: "danger", text: "text-danger-strong", fill: "bg-destructive" },
};

/** A rating always carries an icon and a word, never color alone. */
export function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return <InfoChip tone="neutral">No data</InfoChip>;
  const style = RATING_STYLE[rating];
  return (
    <InfoChip tone={style.tone} icon={style.icon} className="shrink-0">
      {RATING_LABELS[rating]}
    </InfoChip>
  );
}

/** "2.9 s" → the number in full weight, the unit muted. */
export function MetricValue({ text, className }: { text: string; className?: string }) {
  const match = /^([\d.,]+)\s*(\S*)$/.exec(text);
  return (
    <span className={className}>
      {match ? (
        <>
          {match[1]}
          {match[2] && " "}
          {match[2] && <span className="text-[0.6em] font-semibold opacity-60">{match[2]}</span>}
        </>
      ) : (
        text
      )}
    </span>
  );
}

export function RatingIcon({ rating, className }: { rating: Rating; className?: string }) {
  const style = RATING_STYLE[rating];
  return <style.icon className={cn("size-4 shrink-0", style.text, className)} aria-hidden />;
}

const pct = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

/** Share of visits rated good / needs improvement / poor, as one 100% bar with labels. */
export function ShareBar({ shares }: { shares: Record<Rating, number> }) {
  const total = shares.good + shares["needs-improvement"] + shares.poor;
  if (total === 0) return null;
  const parts = (["good", "needs-improvement", "poor"] as const).map((rating) => ({
    rating,
    value: shares[rating],
    share: pct(shares[rating], total),
  }));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-2.5 gap-1"
        role="img"
        aria-label={parts.map((p) => `${RATING_LABELS[p.rating]} ${p.share}%`).join(", ")}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.rating}
              className={cn("visual-grow-x h-full rounded-full", RATING_STYLE[p.rating].fill)}
              style={{ width: `${(p.value / total) * 100}%` }}
            />
          ))}
      </div>
      <ul
        className="text-muted-foreground flex min-h-9 flex-wrap content-start gap-x-3 gap-y-0.5 text-xs"
        aria-hidden
      >
        {parts.map((p) => (
          <li key={p.rating} className="flex items-center gap-1">
            <span className={cn("size-2 rounded-full", RATING_STYLE[p.rating].fill)} />
            {RATING_LABELS[p.rating]} {p.share}%
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Headline tile for one metric: its p75 value, rating, sample count, trend and distribution. */
export function MetricTile({
  summary,
  href,
  trend,
}: {
  summary: MetricSummary;
  href?: string;
  /** Daily p75 values for a sparkline (days without visits left out). */
  trend?: { day: string; label: string; value: number; valueText: string }[];
}) {
  const info = METRIC_INFO[summary.metric];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {summary.metric}{" "}
            <span className="text-muted-foreground font-normal">· {info.short}</span>
          </p>
          <p className="text-muted-foreground text-xs">{info.name}</p>
        </div>
        <RatingBadge rating={summary.rating} />
      </div>
      <MetricValue
        text={formatMetric(summary.metric, summary.p75)}
        className="visual-rise mt-1 block text-[2.25rem] leading-10 font-bold tracking-tight"
      />
      <p className="text-muted-foreground text-xs">
        75th percentile · {summary.samples.toLocaleString("en")}{" "}
        {summary.samples === 1 ? "visit" : "visits"} measured
        {summary.samples > 0 && summary.samples < LOW_SAMPLE && " (few, so this can change a lot)"}
      </p>
      {trend && trend.length > 1 && (
        <AreaChart
          variant="sparkline"
          height={48}
          title={`${summary.metric} 75th percentile per day`}
          points={trend.map((point) => ({
            key: point.day,
            label: point.label,
            value: point.value,
            valueText: point.valueText,
          }))}
        />
      )}
      <div className="mt-auto pt-1">
        <ShareBar shares={summary.shares} />
      </div>
    </>
  );
  const className = cn(perfCard, "flex h-full flex-col gap-2 p-5 sm:p-6");
  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "group visual-lift focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Device and period filters, kept in the URL. */
export function PerformanceFilters({
  base,
  device,
  days,
}: {
  base: string;
  device: DeviceFilter;
  days: Period;
}) {
  const href = (next: { device?: DeviceFilter; days?: Period }) => {
    const params = new URLSearchParams();
    const d = next.device ?? device;
    const p = next.days ?? days;
    if (d !== "all") params.set("device", d);
    if (p !== 28) params.set("days", String(p));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const segment = (active: boolean) =>
    cn(
      "focus-visible:ring-ring/50 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px]",
      active
        ? "bg-surface-card text-foreground ring-card-border ring-1"
        : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Device" className="bg-muted inline-flex gap-0.5 rounded-full p-1">
        {(
          [
            ["all", "All devices"],
            ["mobile", "Mobile"],
            ["desktop", "Desktop"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={href({ device: value })}
            aria-current={device === value ? "page" : undefined}
            className={segment(device === value)}
          >
            {label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Period" className="bg-muted inline-flex gap-0.5 rounded-full p-1">
        {([7, 28] as const).map((value) => (
          <Link
            key={value}
            href={href({ days: value })}
            aria-current={days === value ? "page" : undefined}
            className={segment(days === value)}
          >
            {value} days
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Explains where the numbers come from (field data, never lab data). */
export function DataSourceNote({ from, to }: { from: string; to: string }) {
  return (
    <p className="text-muted-foreground text-xs">
      Field data from real visitors to your website, {from} to {to} (UTC). Values are the 75th
      percentile: 3 in 4 visits were this fast or faster. Thresholds are Google&apos;s Core Web
      Vitals targets; meeting them doesn&apos;t guarantee rankings.
    </p>
  );
}
