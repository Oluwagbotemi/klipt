"use client";

import { useState } from "react";
import { axisTicks, formatNumber } from "@/lib/visual";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  /** Axis label, e.g. "12 Oct". */
  label: string;
  /** Longer label for the tooltip and table, e.g. "Mon 12 Oct". */
  longLabel?: string;
  value: number;
  /** Tooltip and table text for the value, e.g. "3 published". Defaults to the number. */
  valueText?: string;
  /**
   * past: neutral; current: accent (the "now" bar, labelled on its cap);
   * future: hatched (planned, e.g. scheduled posts).
   */
  kind?: "past" | "current" | "future";
}

const describe = (bar: BarDatum) => bar.valueText ?? formatNumber(bar.value);

/**
 * Columns with rounded caps grown from one baseline. One bar is picked out in
 * the accent; the rest stay neutral; future bars are hatched. Hover, tap or
 * arrow keys show a dark tooltip, and an sr-only table carries every value.
 */
export function BarChart({
  data,
  title,
  height = 180,
  className,
}: {
  data: BarDatum[];
  /** Accessible name of the chart. */
  title: string;
  height?: number;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = axisTicks(max || 1, 3, { integers: data.every((d) => Number.isInteger(d.value)) });
  const top = ticks[ticks.length - 1] || 1;
  const currentIndex = data.findIndex((d) => d.kind === "current");
  // About five labels, never crowding the current bar's.
  const stride = Math.max(1, Math.ceil(data.length / 5));
  const showLabel = (i: number) =>
    i === currentIndex ||
    (i % stride === 0 &&
      (currentIndex < 0 || Math.abs(i - currentIndex) >= Math.max(2, stride * 0.75)));
  const activeBar = active === null ? null : data[active];

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (event.key === "Escape") return setActive(null);
    if (event.key === "Home") return setActive(0);
    if (event.key === "End") return setActive(data.length - 1);
    if (!step) return;
    event.preventDefault();
    setActive((i) => {
      const from = i ?? (currentIndex >= 0 ? currentIndex : data.length - 1);
      return Math.min(data.length - 1, Math.max(0, from + (i === null ? 0 : step)));
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="group"
        aria-label={`${title}. Use the left and right arrow keys to read each bar.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((i) => i ?? (currentIndex >= 0 ? currentIndex : data.length - 1))}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="focus-visible:ring-ring/50 relative flex rounded-xl outline-none focus-visible:ring-[3px]"
        style={{ height }}
      >
        {/* Y axis ticks and hairline grid. */}
        <div
          aria-hidden
          className="text-muted-foreground relative w-8 shrink-0 text-[11px] tabular-nums"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 -translate-y-1/2"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {formatNumber(tick)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="bg-chart-grid absolute inset-x-0 h-px"
              style={{ bottom: `${(tick / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((bar, i) => {
              const share = bar.value / top;
              const isActive = active === i;
              return (
                <div
                  key={bar.key}
                  aria-hidden
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                  className="relative flex h-full flex-1 items-end justify-center px-[2px]"
                >
                  {bar.kind === "current" && (
                    <span
                      className="visual-rise absolute text-xs font-semibold tabular-nums"
                      style={{ bottom: `calc(${share * 100}% + 6px)` }}
                    >
                      {formatNumber(bar.value)}
                    </span>
                  )}
                  {bar.kind === "current" && bar.value === 0 && (
                    // Marks where "now" is when it has nothing yet (a marker, not data).
                    <span className="bg-primary absolute bottom-0 left-1/2 h-[3px] w-[calc(100%-4px)] max-w-7 -translate-x-1/2 rounded-full" />
                  )}
                  <span
                    className={cn(
                      "visual-grow-y block w-full max-w-7 rounded-t-[6px] rounded-b-[2px] transition-colors",
                      bar.kind === "current" && (isActive ? "bg-primary/85" : "bg-primary"),
                      bar.kind === "future" && "visual-hatch ring-hatch ring-1 ring-inset",
                      (bar.kind ?? "past") === "past" &&
                        (isActive ? "bg-chart-neutral-hover" : "bg-chart-neutral"),
                    )}
                    style={{
                      height: bar.value > 0 ? `max(${share * 100}%, 4px)` : 0,
                      animationDelay: `${Math.round((i / Math.max(1, data.length)) * 150)}ms`,
                    }}
                  />
                </div>
              );
            })}
          </div>
          {activeBar && active !== null && (
            <ChartTooltip
              left={`${((active + 0.5) / data.length) * 100}%`}
              bottom={`calc(${(activeBar.value / top) * 100}% + 10px)`}
              value={describe(activeBar)}
              label={activeBar.longLabel ?? activeBar.label}
            />
          )}
        </div>
      </div>
      {/* X axis labels (sparse; the current bar is always labelled). */}
      <div aria-hidden className="text-muted-foreground relative ml-8 h-4 text-[11px]">
        {data.map((bar, i) =>
          showLabel(i) ? (
            <span
              key={bar.key}
              className={cn(
                "absolute top-0 -translate-x-1/2 whitespace-nowrap",
                i === currentIndex && "text-foreground font-semibold",
              )}
              style={{
                left: `clamp(1.25rem, ${((i + 0.5) / data.length) * 100}%, calc(100% - 1.25rem))`,
              }}
            >
              {bar.label}
            </span>
          ) : null,
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {activeBar ? `${activeBar.longLabel ?? activeBar.label}: ${describe(activeBar)}` : ""}
      </p>
      {/* Tables ignore sr-only sizing, so the wrapper clips it. */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((bar) => (
              <tr key={bar.key}>
                <th scope="row">{bar.longLabel ?? bar.label}</th>
                <td>{describe(bar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The dark tooltip bubble shared by the charts. Value first, label second. */
export function ChartTooltip({
  left,
  bottom,
  top,
  value,
  label,
}: {
  left: string;
  bottom?: string;
  top?: string;
  value: string;
  label: string;
}) {
  return (
    <span
      aria-hidden
      className="bg-tooltip text-tooltip-foreground visual-fade pointer-events-none absolute z-20 flex -translate-x-1/2 flex-col items-center rounded-xl px-3 py-1.5 text-center whitespace-nowrap shadow-lg"
      style={{
        left: `clamp(3.5rem, ${left}, calc(100% - 3.5rem))`,
        bottom,
        top,
      }}
    >
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] opacity-70">{label}</span>
    </span>
  );
}
