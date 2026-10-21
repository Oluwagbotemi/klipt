import Link from "next/link";
import { CircleAlert, CircleCheck, CircleX, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export const perfCard = "bg-card rounded-2xl border";

const RATING_STYLE: Record<
  Rating,
  { icon: LucideIcon; badge: "success" | "warning" | "destructive"; text: string; fill: string }
> = {
  good: { icon: CircleCheck, badge: "success", text: "text-success", fill: "bg-success" },
  "needs-improvement": {
    icon: CircleAlert,
    badge: "warning",
    text: "text-warning",
    fill: "bg-warning",
  },
  poor: { icon: CircleX, badge: "destructive", text: "text-destructive", fill: "bg-destructive" },
};

/** A rating always carries an icon and a word, never color alone. */
export function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return <Badge variant="outline">No data</Badge>;
  const style = RATING_STYLE[rating];
  return (
    <Badge variant={style.badge}>
      <style.icon aria-hidden />
      {RATING_LABELS[rating]}
    </Badge>
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
        className="flex h-2 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={parts.map((p) => `${RATING_LABELS[p.rating]} ${p.share}%`).join(", ")}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.rating}
              className={cn(
                "h-full first:rounded-l-full last:rounded-r-full",
                RATING_STYLE[p.rating].fill,
              )}
              style={{ width: `${(p.value / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs" aria-hidden>
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

/** Headline tile for one metric: its p75 value, rating, sample count and distribution. */
export function MetricTile({ summary, href }: { summary: MetricSummary; href?: string }) {
  const info = METRIC_INFO[summary.metric];
  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {summary.metric}{" "}
            <span className="text-muted-foreground font-normal">· {info.short}</span>
          </p>
          <p className="text-muted-foreground text-xs">{info.name}</p>
        </div>
        <RatingBadge rating={summary.rating} />
      </div>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">
        {formatMetric(summary.metric, summary.p75)}
      </p>
      <p className="text-muted-foreground text-xs">
        75th percentile · {summary.samples.toLocaleString("en")}{" "}
        {summary.samples === 1 ? "visit" : "visits"} measured
        {summary.samples > 0 && summary.samples < LOW_SAMPLE && " (few, so this can change a lot)"}
      </p>
      <ShareBar shares={summary.shares} />
    </>
  );
  const className = cn(perfCard, "flex h-full flex-col gap-2 p-4 sm:p-5");
  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "hover:bg-accent/40 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
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
      "focus-visible:ring-ring/50 rounded-md px-3 py-1 text-sm whitespace-nowrap outline-none focus-visible:ring-[3px]",
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Device" className="bg-muted inline-flex gap-0.5 rounded-lg p-1">
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
      <nav aria-label="Period" className="bg-muted inline-flex gap-0.5 rounded-lg p-1">
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
