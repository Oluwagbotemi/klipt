"use client";

import { useId, useState } from "react";
import { ChartTooltip } from "@/components/visual/bar-chart";
import { axisTicks, formatNumber, smoothPath } from "@/lib/visual";
import { cn } from "@/lib/utils";

export interface AreaPoint {
  key: string;
  label: string;
  value: number;
  /** Tooltip and table text, e.g. "2.4 s". Defaults to the number. */
  valueText?: string;
}

const VIEW_H = 100;
const say = (point: AreaPoint) => point.valueText ?? formatNumber(point.value);

/**
 * A smooth line with a soft gradient wash underneath and a dot on the latest
 * point. Drawn in a stretchable SVG (the line keeps its 2px width) with the dot,
 * crosshair and tooltip in HTML, so it renders on the server at any width.
 *
 * `variant="sparkline"` is a small decorative trend (no axis, no interaction;
 * the surrounding card states the numbers).
 */
export function AreaChart({
  points,
  title,
  height = 160,
  variant = "full",
  className,
}: {
  points: AreaPoint[];
  title: string;
  height?: number;
  variant?: "full" | "sparkline";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const sparkline = variant === "sparkline";
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = sparkline ? [0, max * 1.15 || 1] : axisTicks(max || 1, 3);
  const top = ticks[ticks.length - 1] || 1;
  const n = points.length;
  const xOf = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const yOf = (v: number) => VIEW_H - (v / top) * VIEW_H;
  const coords = points.map((p, i) => ({ x: xOf(i), y: yOf(p.value) }));
  const line = smoothPath(coords);
  const area = n > 0 ? `${line} L100,${VIEW_H} L0,${VIEW_H} Z` : "";
  const last = coords[n - 1];
  const activePoint = active === null ? null : points[active];

  function fromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / Math.max(1, box.width);
    setActive(Math.min(n - 1, Math.max(0, Math.round(fraction * (n - 1)))));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (event.key === "Escape") return setActive(null);
    if (!step) return;
    event.preventDefault();
    setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + (i === null ? 0 : step))));
  }

  const plot = (
    <div className="relative h-full flex-1">
      {!sparkline &&
        ticks.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="bg-chart-grid absolute inset-x-0 h-px"
            style={{ bottom: `${(tick / top) * 100}%` }}
          />
        ))}
      <svg
        aria-hidden
        viewBox={`0 0 100 ${VIEW_H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="[stop-color:var(--primary)] [stop-opacity:0.22]" />
            <stop offset="100%" className="[stop-color:var(--primary)] [stop-opacity:0]" />
          </linearGradient>
        </defs>
        {n > 1 && <path d={area} fill={`url(#${id}-fill)`} className="visual-fade" />}
        {n > 1 && (
          <path
            d={line}
            pathLength={1}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-primary visual-draw"
          />
        )}
      </svg>
      {active !== null && !sparkline && (
        <span
          aria-hidden
          className="bg-foreground/25 absolute inset-y-0 w-px"
          style={{ left: `${coords[active].x}%` }}
        />
      )}
      {last && (
        <Dot
          x={active !== null && !sparkline ? coords[active].x : last.x}
          y={active !== null && !sparkline ? coords[active].y : last.y}
          small={sparkline}
        />
      )}
      {activePoint && active !== null && !sparkline && (
        <ChartTooltip
          left={`${coords[active].x}%`}
          bottom={`calc(${100 - coords[active].y}% + 14px)`}
          value={say(activePoint)}
          label={activePoint.label}
        />
      )}
    </div>
  );

  if (sparkline) {
    return (
      <div aria-hidden className={cn("flex", className)} style={{ height }}>
        {plot}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="group"
        aria-label={`${title}. Use the left and right arrow keys to read each point.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((i) => i ?? n - 1)}
        onBlur={() => setActive(null)}
        onPointerMove={fromPointer}
        onPointerDown={fromPointer}
        onPointerLeave={() => setActive(null)}
        className="focus-visible:ring-ring/50 relative flex rounded-xl outline-none focus-visible:ring-[3px]"
        style={{ height }}
      >
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
        {plot}
      </div>
      <div aria-hidden className="text-muted-foreground flex justify-between pl-8 text-[11px]">
        <span>{points[0]?.label}</span>
        <span>{points[n - 1]?.label}</span>
      </div>
      <p aria-live="polite" className="sr-only">
        {activePoint ? `${activePoint.label}: ${say(activePoint)}` : ""}
      </p>
      {/* Tables ignore sr-only sizing, so the wrapper clips it. */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <th scope="row">{point.label}</th>
                <td>{say(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The latest-point dot: accent fill with a 2px ring in the card colour. */
function Dot({ x, y, small }: { x: number; y: number; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary ring-card visual-fade absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2",
        small ? "size-2" : "size-2.5",
      )}
      style={{ left: `${x}%`, top: `${(y / VIEW_H) * 100}%` }}
    />
  );
}
