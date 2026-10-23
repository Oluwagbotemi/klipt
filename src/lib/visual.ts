/*
 * Pure helpers for the visual components (src/components/visual). Client-safe.
 */

export interface NumberFormat {
  /** Digits after the decimal point (default 0). */
  decimals?: number;
  /** 12.9K / 4.2M from 10,000 up (default true). Big standalone values only. */
  compact?: boolean;
  /** Shown before the number, muted (e.g. "$"). */
  prefix?: string;
  /** Shown after the number, muted (e.g. "%", " s"). */
  unit?: string;
}

/** The parts of a formatted number, so decimals and units can be muted. */
export interface NumberParts {
  prefix: string;
  whole: string;
  fraction: string;
  unit: string;
}

const COMPACT = [
  { at: 1_000_000_000, suffix: "B" },
  { at: 1_000_000, suffix: "M" },
  { at: 10_000, suffix: "K", divide: 1_000 },
];

export function numberParts(value: number, format: NumberFormat = {}): NumberParts {
  const { decimals = 0, compact = true, prefix = "", unit = "" } = format;
  let scaled = value;
  let suffix = "";
  let digits = decimals;
  if (compact) {
    const step = COMPACT.find((s) => Math.abs(value) >= s.at);
    if (step) {
      scaled = value / (step.divide ?? step.at);
      suffix = step.suffix;
      digits = Math.abs(scaled) < 100 ? 1 : 0;
    }
  }
  const text = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(scaled);
  const dot = text.indexOf(".");
  return {
    prefix,
    whole: dot === -1 ? text : text.slice(0, dot),
    fraction: dot === -1 ? "" : text.slice(dot),
    unit: `${suffix}${unit}`,
  };
}

export function formatNumber(value: number, format: NumberFormat = {}) {
  const parts = numberParts(value, format);
  return `${parts.prefix}${parts.whole}${parts.fraction}${parts.unit}`;
}

/** Signed change between two periods; null when there is nothing to compare. */
export function periodChange(current: number, previous: number) {
  if (current === 0 && previous === 0) return null;
  return {
    difference: current - previous,
    percent: previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
  };
}

/** Clean axis ticks from 0 to a rounded maximum (1, 2, 5 × 10ⁿ steps). */
export function axisTicks(max: number, count = 3, { integers = false } = {}): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const nice = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  // Counts never need half steps.
  const step = integers ? Math.max(1, nice) : nice;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step)
    ticks.push(Math.round(value * 1e6) / 1e6);
  return ticks;
}

/**
 * Smooth SVG path through points (monotone cubic, so the curve never overshoots
 * the data). Coordinates are in the caller's units.
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (dx[i] || 1));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  let d = `M${round(points[0].x)},${round(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3;
    d +=
      ` C${round(points[i].x + third)},${round(points[i].y + tangent[i] * third)}` +
      ` ${round(points[i + 1].x - third)},${round(points[i + 1].y - tangent[i + 1] * third)}` +
      ` ${round(points[i + 1].x)},${round(points[i + 1].y)}`;
  }
  return d;
}

const round = (n: number) => Math.round(n * 100) / 100;
