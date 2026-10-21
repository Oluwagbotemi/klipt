import { z } from "zod";
import type { MediaUsage } from "@/lib/media";

/*
 * Performance (real-user Core Web Vitals) rules shared by the ingest endpoint,
 * the server queries and the Performance pages. Client-safe: no database code.
 *
 * Klipt is headless, so it can't load the customer's website itself. The
 * website reports what real visitors experienced (POST /api/v1/vitals) and
 * Klipt keeps only daily histograms per page, metric and device class.
 */

export const METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type Metric = (typeof METRICS)[number];

/** The three Core Web Vitals, shown first everywhere. */
export const CORE_METRICS = ["LCP", "INP", "CLS"] as const satisfies readonly Metric[];

export const DEVICES = ["mobile", "desktop"] as const;
export type Device = (typeof DEVICES)[number];

export type Rating = "good" | "needs-improvement" | "poor";

interface MetricInfo {
  name: string;
  short: string;
  unit: "ms" | "score";
  /** Upper bound of "good" and of "needs improvement" (Google's thresholds, at p75). */
  good: number;
  poor: number;
  /** Largest value accepted from a browser. */
  max: number;
  /** Histogram bucket edges (lower bounds). Thresholds are edges, so shares are exact. */
  edges: number[];
  what: string;
  learnMore: string;
}

export const METRIC_INFO: Record<Metric, MetricInfo> = {
  LCP: {
    name: "Largest Contentful Paint",
    short: "Loading",
    unit: "ms",
    good: 2500,
    poor: 4000,
    max: 120_000,
    edges: [
      0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000, 3250, 3500, 3750,
      4000, 4500, 5000, 6000, 7000, 8000, 10_000, 15_000, 20_000, 30_000,
    ],
    what: "How long until the main content (usually the biggest image or heading) is visible.",
    learnMore: "https://web.dev/articles/lcp",
  },
  INP: {
    name: "Interaction to Next Paint",
    short: "Responsiveness",
    unit: "ms",
    good: 200,
    poor: 500,
    max: 60_000,
    edges: [
      0, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000,
      1500, 2000, 3000, 5000,
    ],
    what: "How quickly the page reacts when someone taps, clicks or types.",
    learnMore: "https://web.dev/articles/inp",
  },
  CLS: {
    name: "Cumulative Layout Shift",
    short: "Visual stability",
    unit: "score",
    good: 0.1,
    poor: 0.25,
    max: 50,
    edges: [
      0, 0.01, 0.025, 0.05, 0.075, 0.1, 0.125, 0.15, 0.175, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 2,
    ],
    what: "How much the page jumps around while it loads (lower is better; it has no unit).",
    learnMore: "https://web.dev/articles/cls",
  },
  FCP: {
    name: "First Contentful Paint",
    short: "First content",
    unit: "ms",
    good: 1800,
    poor: 3000,
    max: 120_000,
    edges: [
      0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3500,
      4000, 5000, 6000, 8000, 10_000, 20_000,
    ],
    what: "How long until anything (text or an image) first appears.",
    learnMore: "https://web.dev/articles/fcp",
  },
  TTFB: {
    name: "Time to First Byte",
    short: "Server response",
    unit: "ms",
    good: 800,
    poor: 1800,
    max: 120_000,
    edges: [
      0, 100, 200, 300, 400, 500, 600, 700, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2500, 3000,
      4000, 6000, 10_000,
    ],
    what: "How long your website's server takes to start sending the page.",
    learnMore: "https://web.dev/articles/ttfb",
  },
};

export const RATING_LABELS: Record<Rating, string> = {
  good: "Good",
  "needs-improvement": "Needs improvement",
  poor: "Poor",
};

export function rate(metric: Metric, value: number): Rating {
  const { good, poor } = METRIC_INFO[metric];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

/** Index of the histogram bucket a value falls into. */
export function bucketIndex(metric: Metric, value: number): number {
  const { edges } = METRIC_INFO[metric];
  let index = 0;
  // Values on an edge belong to the bucket below it, so "≤ threshold" stays "good".
  for (let i = 1; i < edges.length; i++) if (value > edges[i]) index = i;
  return index;
}

export interface Bucket {
  index: number;
  count: number;
  /** Sum of the values in the bucket (for its average). */
  sum: number;
}

/**
 * Approximate percentile from bucket counts: find the bucket holding the
 * p-th value, then interpolate linearly between its edges (the open-ended
 * last bucket uses its average). The error is at most one bucket width.
 */
export function percentile(metric: Metric, buckets: Bucket[], p = 0.75): number | null {
  const sorted = buckets.filter((b) => b.count > 0).sort((a, b) => a.index - b.index);
  const total = sorted.reduce((n, b) => n + b.count, 0);
  if (total === 0) return null;
  const { edges } = METRIC_INFO[metric];
  const rank = p * total;
  let seen = 0;
  for (const bucket of sorted) {
    if (seen + bucket.count >= rank) {
      const lower = edges[bucket.index];
      const upper = edges[bucket.index + 1];
      if (upper === undefined) return bucket.sum / bucket.count;
      const within = (rank - seen) / bucket.count;
      return lower + (upper - lower) * within;
    }
    seen += bucket.count;
  }
  const last = sorted[sorted.length - 1];
  return last.sum / last.count;
}

/** Share of samples in each rating band. Thresholds are bucket edges, so this is exact. */
export function distribution(metric: Metric, buckets: Bucket[]): Record<Rating, number> {
  const { edges, good, poor } = METRIC_INFO[metric];
  const result: Record<Rating, number> = { good: 0, "needs-improvement": 0, poor: 0 };
  for (const bucket of buckets) {
    const lower = edges[bucket.index];
    const band: Rating = lower < good ? "good" : lower < poor ? "needs-improvement" : "poor";
    result[band] += bucket.count;
  }
  return result;
}

/** "2.51 s", "192 ms", "0.09" (with a non-breaking space before the unit). */
export function formatMetric(metric: Metric, value: number | null): string {
  if (value === null) return "–";
  if (value === 0) return "0";
  const { unit, good, poor } = METRIC_INFO[metric];
  // One more digit when rounding would show a value just over a threshold as the threshold.
  const precise = (digits: number, scale: number) => {
    const shown = Number((value / scale).toFixed(digits)) * scale;
    const hides = [good, poor].some((t) => value > t && shown <= t);
    return (value / scale).toFixed(hides ? digits + 1 : digits);
  };
  if (unit === "score") return precise(2, 1);
  if (value >= 10_000) return `${(value / 1000).toFixed(0)}\u00a0s`;
  if (value >= 1000) return `${precise(1, 1000)}\u00a0s`;
  return `${precise(0, 1)}\u00a0ms`;
}

/** Pages with fewer samples than this are flagged: their numbers can swing a lot. */
export const LOW_SAMPLE = 50;

/* ---------- Ingest ---------- */

export const VITALS_LIMITS = {
  /** Events per request. */
  batch: 50,
  /** Request body size in bytes. */
  bodyBytes: 16_384,
  /** Stored path length; longer paths are cut. */
  pathLength: 300,
  /** Samples accepted per site per UTC day. */
  dailySamples: 100_000,
  /** Distinct paths per site per UTC day; the rest are counted under OTHER_PATH. */
  dailyPaths: 1000,
} as const;

/** Where samples for paths past the daily limit are counted. */
export const OTHER_PATH = "(other pages)";

/** Pages listed per report, worst first. */
export const PAGE_LIMIT = 200;

/** Days of daily data kept. */
export const VITALS_RETENTION_DAYS = 90;

export const PERIODS = [7, 28] as const;
export type Period = (typeof PERIODS)[number];

/**
 * The visitor's address as the website reports it: a path ("/posts/hello")
 * or a full URL. Query strings and fragments are dropped (they can carry
 * personal data), trailing slashes removed.
 */
export function cleanVitalsPath(input: string): string | null {
  let path = input.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  path = path.split(/[?#]/)[0];
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  try {
    path = decodeURI(path);
  } catch {
    // Keep it as sent.
  }
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  path = path.replace(/\/+$/, "") || "/";
  return path.slice(0, VITALS_LIMITS.pathLength);
}

const eventSchema = z
  .object({
    metric: z.enum(METRICS),
    value: z.number().finite().min(0),
    rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
    path: z.string().max(2048),
    navigationType: z.string().max(40).optional(),
    deviceType: z.enum(DEVICES).optional(),
    connection: z.string().max(20).optional(),
  })
  .passthrough()
  .superRefine((event, ctx) => {
    if (event.value > METRIC_INFO[event.metric].max) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "is out of range" });
    }
  });

export const vitalsPayloadSchema = z.object({
  key: z.string().min(1).max(100),
  events: z.array(eventSchema).min(1).max(VITALS_LIMITS.batch),
});

export interface VitalsEvent {
  metric: Metric;
  value: number;
  path: string;
  device: Device;
}

/* ---------- Report shapes (server → pages) ---------- */

export interface MetricSummary {
  metric: Metric;
  p75: number | null;
  samples: number;
  rating: Rating | null;
  shares: Record<Rating, number>;
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD (UTC)
  p75: number | null;
  samples: number;
}

export interface PagePerformance {
  path: string;
  entryId: string | null;
  title: string | null;
  metrics: Partial<Record<Metric, { p75: number; samples: number; rating: Rating }>>;
  samples: number;
  worst: Rating | null;
}

export interface PerformanceSetup {
  ingestKey: string;
  domain: string | null;
  previewOrigin: string | null;
  origins: string[];
  lastReceivedOn: string | null;
}

export const deviceParam = z.enum(["all", ...DEVICES]).catch("all");
export const periodParam = z.coerce
  .number()
  .pipe(z.union([z.literal(7), z.literal(28)]))
  .catch(28);

export type DeviceFilter = z.output<typeof deviceParam>;

export function parsePerformanceParams(query: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return {
    device: deviceParam.parse(first(query.device)),
    days: periodParam.parse(first(query.days)) as Period,
  };
}

/** The worst of several ratings. */
export function worstRating(ratings: (Rating | null | undefined)[]): Rating | null {
  if (ratings.includes("poor")) return "poor";
  if (ratings.includes("needs-improvement")) return "needs-improvement";
  return ratings.includes("good") ? "good" : null;
}

/** Origins a site's visitors report from: its domain (with and without www) and preview site. */
export function allowedOrigins(domain: string | null, previewUrl: string | null): string[] {
  const origins = new Set<string>();
  if (domain) {
    const bare = domain.replace(/^www\./, "");
    origins.add(`https://${bare}`);
    origins.add(`https://www.${bare}`);
  }
  if (previewUrl) {
    try {
      const url = new URL(previewUrl);
      if (url.protocol === "https:" || url.hostname === "localhost") origins.add(url.origin);
    } catch {
      // An invalid preview address is ignored.
    }
  }
  return [...origins];
}

/** The ingest key format: public by design, safe in browser code. */
export const INGEST_KEY_PREFIX = "kpub_";

/* ---------- Assets and recommendations ---------- */

export const LARGE_IMAGE_BYTES = 300 * 1024;
export const LARGE_IMAGE_WIDTH = 2500;

export type AssetIssue = "large_file" | "too_wide" | "no_dimensions" | "no_alt";

export interface AssetFinding {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  issues: AssetIssue[];
  usage: MediaUsage[];
}

export interface Recommendation {
  key: string;
  severity: Rating | "info";
  title: string;
  why: string;
  fix: string;
  pages: { path: string; entryId: string | null; title: string | null; value: string }[];
  assets: { id: string; filename: string; detail: string }[];
  learnMore: string;
}
