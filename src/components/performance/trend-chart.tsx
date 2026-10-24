"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatMetric,
  METRIC_INFO,
  rate,
  RATING_LABELS,
  type DailyPoint,
  type Metric,
} from "@/lib/performance";
import { cn } from "@/lib/utils";

const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * Daily 75th-percentile line for one metric over Google's rating bands.
 * Hover, touch or arrow keys show each day's value; days without data leave a gap.
 */
export function TrendChart({ metric, points }: { metric: Metric; points: DailyPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(260, Math.round(entry.contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const info = METRIC_INFO[metric];
  const values = points.flatMap((p) => (p.p75 === null ? [] : [p.p75]));
  const top = Math.max(info.poor * 1.3, ...values.map((v) => v * 1.1));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (Math.min(v, top) / top) * plotH;

  // Line segments, broken at days without data.
  const segments: string[] = [];
  let current = "";
  points.forEach((point, i) => {
    if (point.p75 === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(point.p75).toFixed(1)}`;
  });
  if (current) segments.push(current);
  const isolated = points
    .map((point, i) => ({ point, i }))
    .filter(
      ({ point, i }) =>
        point.p75 !== null && points[i - 1]?.p75 == null && points[i + 1]?.p75 == null,
    );

  const bands = [
    { from: 0, to: info.good, fill: "fill-success/10", label: RATING_LABELS.good },
    {
      from: info.good,
      to: info.poor,
      fill: "fill-warning/10",
      label: RATING_LABELS["needs-improvement"],
    },
    { from: info.poor, to: top, fill: "fill-destructive/10", label: RATING_LABELS.poor },
  ];
  const ticks = [0, info.good, info.poor];
  const labelDays = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  function pick(clientX: number) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const ratio = (clientX - rect.left - PAD.left) / plotW;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  const point = active !== null ? points[active] : null;
  const tooltipLeft = active !== null ? Math.min(Math.max(x(active) - 80, 0), width - 168) : 0;

  return (
    <div ref={wrap} className="relative w-full overflow-hidden">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        tabIndex={0}
        aria-label={`${info.name}, daily 75th percentile. Use the arrow keys to read each day, or open the data table below.`}
        className="focus-visible:ring-ring/50 block touch-pan-y rounded-lg outline-none focus-visible:ring-[3px]"
        onPointerMove={(event) => pick(event.clientX)}
        onPointerDown={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const step = event.key === "ArrowRight" ? 1 : -1;
            setActive((i) =>
              Math.max(0, Math.min(points.length - 1, (i ?? points.length - 1) + step)),
            );
          } else if (event.key === "Escape") setActive(null);
        }}
      >
        {bands.map((band) => (
          <g key={band.label}>
            <rect
              x={PAD.left}
              width={plotW}
              y={y(band.to)}
              height={Math.max(0, y(band.from) - y(band.to))}
              className={band.fill}
            />
            {y(band.from) - y(band.to) > 16 && (
              <text
                x={PAD.left + plotW - 6}
                y={y(band.to) + 13}
                textAnchor="end"
                strokeWidth={3}
                strokeLinejoin="round"
                className="fill-muted-foreground stroke-card text-[11px] [paint-order:stroke]"
              >
                {band.label}
              </text>
            )}
          </g>
        ))}
        {ticks.map((tick) => (
          <g key={tick}>
            {tick > 0 && (
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeDasharray="4 4"
              />
            )}
            <text
              x={PAD.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {formatMetric(metric, tick)}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          className="stroke-border"
        />
        {labelDays
          .filter((i, n, all) => i >= 0 && all.indexOf(i) === n)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="fill-muted-foreground text-[11px]"
            >
              {shortDay(points[i].day)}
            </text>
          ))}
        {segments.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {isolated.map(({ point: p, i }) => (
          <circle key={i} cx={x(i)} cy={y(p.p75!)} r={4} className="fill-primary stroke-card" />
        ))}
        {point && active !== null && (
          <g aria-hidden>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="stroke-foreground/30"
            />
            {point.p75 !== null && (
              <circle
                cx={x(active)}
                cy={y(point.p75)}
                r={5}
                strokeWidth={2}
                className="fill-primary stroke-card"
              />
            )}
          </g>
        )}
      </svg>
      {point && (
        <div
          role="status"
          className="bg-tooltip text-tooltip-foreground visual-fade pointer-events-none absolute top-2 w-40 rounded-xl px-3 py-2 text-xs shadow-lg"
          style={{ left: tooltipLeft }}
        >
          <p className="font-medium">{shortDay(point.day)}</p>
          {point.p75 === null ? (
            <p className="opacity-70">No visits measured</p>
          ) : (
            <>
              <p className="tabular-nums">
                {formatMetric(metric, point.p75)}{" "}
                <span className="opacity-70">· {RATING_LABELS[rate(metric, point.p75)]}</span>
              </p>
              <p className="tabular-nums opacity-70">
                {point.samples.toLocaleString("en")} {point.samples === 1 ? "visit" : "visits"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The same numbers as a table, for screen readers and anyone who prefers exact values. */
export function TrendTable({
  metric,
  points,
  className,
}: {
  metric: Metric;
  points: DailyPoint[];
  className?: string;
}) {
  return (
    <details className={cn("text-sm", className)}>
      <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs">
        Show data table
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
        <table className="w-full text-xs">
          <caption className="sr-only">{METRIC_INFO[metric].name} by day</caption>
          <thead className="bg-muted text-muted-foreground sticky top-0">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left font-medium">
                Day
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                75th percentile
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">
                Visits
              </th>
            </tr>
          </thead>
          <tbody className="divide-card-border divide-y">
            {[...points].reverse().map((point) => (
              <tr key={point.day}>
                <td className="px-3 py-1.5">{shortDay(point.day)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {point.p75 === null ? "–" : formatMetric(metric, point.p75)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {point.samples.toLocaleString("en")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
