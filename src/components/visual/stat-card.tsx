import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { IconTile, type IconTone } from "@/components/visual/card";
import { CountUp } from "@/components/visual/count-up";
import type { NumberFormat } from "@/lib/visual";
import { cn } from "@/lib/utils";

/**
 * One number that matters: a small muted label, the big value (counts up), an
 * optional change badge and caption, and an optional sparkline. With `href` the
 * whole card is a link that lifts on hover, with the round arrow in the corner.
 */
export function StatCard({
  label,
  value,
  format,
  icon,
  iconTone = "neutral",
  delta,
  caption,
  chart,
  href,
  className,
}: {
  label: string;
  value: number;
  format?: NumberFormat;
  icon?: LucideIcon;
  iconTone?: IconTone;
  /** A DeltaBadge. */
  delta?: React.ReactNode;
  /** Short muted text next to the delta, e.g. "vs previous 28 days". */
  caption?: React.ReactNode;
  /** A sparkline (AreaChart variant="sparkline"). */
  chart?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      {/* Fixed rhythm so tiles in a row share baselines: label row, number,
          caption line and chart slot all have set heights. */}
      <div className="flex h-8 items-center gap-2">
        {icon && <IconTile icon={icon} tone={iconTone} size="sm" />}
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {label}
        </span>
        {href && (
          <span
            aria-hidden
            className="visual-arrow border-card-border text-foreground hidden size-8 shrink-0 place-items-center rounded-full border sm:grid"
          >
            <ArrowUpRight className="size-4" />
          </span>
        )}
      </div>
      <CountUp
        value={value}
        format={format}
        className="mt-3 block h-9 text-[2rem] leading-9 font-bold tracking-tight"
      />
      <div className="mt-2 flex h-6 min-w-0 items-center gap-2">
        {delta}
        <span
          className="text-muted-foreground min-w-0 truncate text-xs"
          title={typeof caption === "string" ? caption : undefined}
        >
          {caption ?? " "}
        </span>
      </div>
      <div className="mt-auto flex h-14 flex-col justify-end pt-3">{chart}</div>
    </>
  );

  const classes = cn("visual-card flex h-full min-w-0 flex-col p-4 sm:p-5", className);
  return href ? (
    <Link
      href={href}
      className={cn(
        classes,
        "group visual-lift focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
