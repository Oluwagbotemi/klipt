import { cn } from "@/lib/utils";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** Stroke and swatch colour, e.g. "stroke-chart-good" + "bg-chart-good". */
  stroke: string;
  swatch: string;
}

const SIZE = 132;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3;

/**
 * Share of a whole as a ring with the total in the middle. Segments are
 * separated by a small gap in the card colour; the legend under it names each
 * one with its count and share, so colour is never the only signal.
 */
export function Donut({
  segments,
  centerValue,
  centerLabel,
  title,
  className,
}: {
  segments: DonutSegment[];
  centerValue: React.ReactNode;
  centerLabel: string;
  /** Accessible name, e.g. "Live pages by SEO status". */
  title: string;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const gap = visible.length > 1 ? GAP : 0;
  const lengthOf = (segment: DonutSegment) => (segment.value / (total || 1)) * CIRCUMFERENCE;
  const arcs = visible.map((segment, i) => ({
    segment,
    dash: Math.max(0, lengthOf(segment) - gap),
    offset: visible.slice(0, i).reduce((sum, s) => sum + lengthOf(s), 0),
  }));
  const percent = (value: number) => (total ? Math.round((value / total) * 100) : 0);

  return (
    <figure className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="visual-rise -rotate-90"
          role="img"
          aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          {arcs.map(({ segment, dash, offset: start }) => (
            <circle
              key={segment.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={-start}
              className={segment.stroke}
            />
          ))}
        </svg>
        <div aria-hidden className="absolute inset-0 grid place-content-center text-center">
          <span className="text-3xl leading-none font-bold tracking-tight">{centerValue}</span>
          <span className="text-muted-foreground mt-1 text-xs">{centerLabel}</span>
        </div>
      </div>
      <figcaption className="w-full">
        <ul className="flex flex-col gap-2 text-sm">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-2">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-[3px]", segment.swatch)} />
              <span className="text-muted-foreground min-w-0 flex-1">{segment.label}</span>
              <span className="font-medium tabular-nums">{segment.value}</span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {percent(segment.value)}%
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
