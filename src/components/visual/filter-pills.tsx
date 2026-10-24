"use client";

import { useRef } from "react";
import Link from "next/link";
import { useOverflowFade } from "@/hooks/use-overflow-fade";
import { cn } from "@/lib/utils";

export type FilterDot = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const DOTS: Record<FilterDot, string> = {
  neutral: "bg-muted-foreground/60",
  accent: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info-strong",
};

export interface FilterPill {
  value: string;
  label: string;
  href: string;
  count?: number;
  /** A small status dot before the label (colour plus the label's words). */
  dot?: FilterDot;
}

/**
 * Link filters as a pill segmented control: a grey track with the current option raised as a
 * white bordered pill, each with its count. Filters live in the URL (links, `aria-current`), so
 * they work without JavaScript; the row scrolls sideways on phones with fading edges.
 */
export function FilterPills({
  label,
  items,
  current,
  className,
}: {
  /** Accessible name of the filter group, e.g. "Filter by status". */
  label: string;
  items: FilterPill[];
  current: string;
  className?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const fade = useOverflowFade(ref);
  return (
    <nav aria-label={label} className={cn("max-w-full min-w-0", className)}>
      <ul
        ref={ref}
        onScroll={fade.onScroll}
        style={fade.style}
        className="bg-muted flex w-fit max-w-full [scrollbar-width:none] gap-1 overflow-x-auto rounded-full p-1 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const isCurrent = item.value === current;
          return (
            <li key={item.value} className="shrink-0">
              <Link
                href={item.href}
                replace
                scroll={false}
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px]",
                  "duration-(--duration-fast)",
                  isCurrent
                    ? "border-card-border bg-surface-card text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.dot && (
                  <span aria-hidden className={cn("size-1.5 rounded-full", DOTS[item.dot])} />
                )}
                {item.label}
                {item.count !== undefined && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                      isCurrent ? "bg-primary-soft text-primary-strong" : "bg-background",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
