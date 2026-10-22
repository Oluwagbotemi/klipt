import { randomBytes } from "node:crypto";
import { and, countDistinct, desc, eq, gte, inArray, isNull, lt, max, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import {
  contentEntries,
  contentModels,
  mediaAssets,
  sites,
  webVitalsDaily,
  webVitalsUsage,
} from "@/server/db/schema";
import { recordActivity } from "@/server/activity";
import { NotAllowedError } from "@/server/errors";
import { usageOf } from "@/server/media";
import { loadPathRules } from "@/server/path-rules";
import { getSiteRole } from "@/server/sites";
import { isImageType } from "@/lib/media";
import { can } from "@/lib/permissions";
import { entryDate, entryPath } from "@/lib/url-patterns";
import {
  allowedOrigins,
  bucketIndex,
  cleanVitalsPath,
  CORE_METRICS,
  distribution,
  formatMetric,
  INGEST_KEY_PREFIX,
  LARGE_IMAGE_BYTES,
  LARGE_IMAGE_WIDTH,
  METRIC_INFO,
  METRICS,
  OTHER_PATH,
  PAGE_LIMIT,
  percentile,
  rate,
  VITALS_LIMITS,
  VITALS_RETENTION_DAYS,
  worstRating,
  type AssetFinding,
  type AssetIssue,
  type Bucket,
  type DailyPoint,
  type Device,
  type DeviceFilter,
  type Metric,
  type MetricSummary,
  type PagePerformance,
  type Period,
  type PerformanceSetup,
  type Recommendation,
  type Rating,
  type VitalsEvent,
} from "@/lib/performance";

/*
 * Performance: real-user Core Web Vitals reported by the customer's website
 * (POST /api/v1/vitals), stored as daily histograms, plus checks on the media
 * library. Reads need performance.view; replacing the reporting key needs
 * performance.manage. Ingest is the one entry point scoped by key, not user.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const daysBefore = (now: Date, days: number) => dayOf(new Date(now.getTime() - days * DAY_MS));

async function requirePermission(
  db: DbOrTx,
  userId: string,
  siteId: string,
  permission: "performance.view" | "performance.manage",
) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  if (!can(role, permission)) throw new NotAllowedError("Can't see performance data.");
  return role;
}

const newIngestKey = () => INGEST_KEY_PREFIX + randomBytes(18).toString("base64url");

/* ---------- Ingest (scoped by the public key) ---------- */

export class IngestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface IngestInput {
  key: string;
  /** The browser's Origin header. */
  origin: string | null;
  events: {
    metric: Metric;
    value: number;
    path: string;
    deviceType?: Device;
  }[];
  /** Device class guessed from the request when an event doesn't say. */
  fallbackDevice: Device;
}

/** The site a reporting key belongs to, with the origins allowed to send for it. */
export async function siteForIngestKey(db: DbOrTx, key: string) {
  if (!key.startsWith(INGEST_KEY_PREFIX)) return null;
  const [site] = await db
    .select({ id: sites.id, domain: sites.domain, previewUrl: sites.previewUrl })
    .from(sites)
    .where(and(eq(sites.vitalsKey, key), isNull(sites.archivedAt)));
  return site ? { id: site.id, origins: allowedOrigins(site.domain, site.previewUrl) } : null;
}

/**
 * Adds a batch of measurements to the site's daily histograms. Refuses unknown
 * keys and origins that aren't the site's own; stops at the daily caps.
 */
export async function ingestVitals(
  db: DbOrTx,
  input: IngestInput,
  now = new Date(),
): Promise<{ accepted: number }> {
  const site = await siteForIngestKey(db, input.key);
  if (!site) throw new IngestError(401, "invalid_key", "This reporting key is invalid.");
  if (site.origins.length === 0) {
    throw new IngestError(
      403,
      "no_domain",
      "Add your website's domain in Klipt (Settings › Domains) before sending measurements.",
    );
  }
  if (!input.origin || !site.origins.includes(input.origin)) {
    throw new IngestError(403, "origin_not_allowed", "This website isn't allowed to report here.");
  }

  const events: VitalsEvent[] = [];
  for (const event of input.events) {
    const path = cleanVitalsPath(event.path);
    if (!path) continue;
    events.push({
      metric: event.metric,
      value: event.value,
      path,
      device: event.deviceType ?? input.fallbackDevice,
    });
  }
  if (events.length === 0) return { accepted: 0 };

  const day = dayOf(now);
  return db.transaction(async (tx) => {
    const [usage] = await tx
      .insert(webVitalsUsage)
      .values({ siteId: site.id, day, samples: events.length })
      .onConflictDoUpdate({
        target: [webVitalsUsage.siteId, webVitalsUsage.day],
        set: { samples: sql`${webVitalsUsage.samples} + ${events.length}` },
      })
      .returning({ samples: webVitalsUsage.samples });
    const before = usage.samples - events.length;
    const room = Math.max(0, VITALS_LIMITS.dailySamples - before);
    if (room === 0) {
      throw new IngestError(429, "daily_limit", "This site's daily measurement limit was reached.");
    }
    const accepted = events.slice(0, room);

    // Cap distinct pages per day so random URLs can't flood the table.
    const batchPaths = [...new Set(accepted.map((event) => event.path))];
    const [known, [{ total }]] = await Promise.all([
      tx
        .selectDistinct({ path: webVitalsDaily.path })
        .from(webVitalsDaily)
        .where(
          and(
            eq(webVitalsDaily.siteId, site.id),
            eq(webVitalsDaily.day, day),
            inArray(webVitalsDaily.path, batchPaths),
          ),
        ),
      tx
        .select({ total: countDistinct(webVitalsDaily.path) })
        .from(webVitalsDaily)
        .where(and(eq(webVitalsDaily.siteId, site.id), eq(webVitalsDaily.day, day))),
    ]);
    const knownPaths = new Set(known.map((row) => row.path));
    let distinct = Number(total);
    const pathFor = new Map<string, string>();
    for (const path of batchPaths) {
      if (knownPaths.has(path)) pathFor.set(path, path);
      else if (distinct < VITALS_LIMITS.dailyPaths) {
        pathFor.set(path, path);
        distinct++;
      } else pathFor.set(path, OTHER_PATH);
    }

    const rows = new Map<string, typeof webVitalsDaily.$inferInsert>();
    for (const event of accepted) {
      const path = pathFor.get(event.path)!;
      const bucket = bucketIndex(event.metric, event.value);
      const id = `${path}\u0000${event.metric}\u0000${event.device}\u0000${bucket}`;
      const row = rows.get(id);
      if (row) {
        row.count += 1;
        row.sum += event.value;
      } else {
        rows.set(id, {
          siteId: site.id,
          day,
          path,
          metric: event.metric,
          device: event.device,
          bucket,
          count: 1,
          sum: event.value,
        });
      }
    }
    await tx
      .insert(webVitalsDaily)
      .values([...rows.values()])
      .onConflictDoUpdate({
        target: [
          webVitalsDaily.siteId,
          webVitalsDaily.day,
          webVitalsDaily.path,
          webVitalsDaily.metric,
          webVitalsDaily.device,
          webVitalsDaily.bucket,
        ],
        set: {
          count: sql`${webVitalsDaily.count} + excluded.count`,
          sum: sql`${webVitalsDaily.sum} + excluded.sum`,
        },
      });
    return { accepted: accepted.length };
  });
}

/** Removes daily data older than the retention window (run by the daily job). */
export async function pruneVitals(db: DbOrTx, now = new Date()) {
  const cutoff = daysBefore(now, VITALS_RETENTION_DAYS);
  const removed = await db
    .delete(webVitalsDaily)
    .where(lt(webVitalsDaily.day, cutoff))
    .returning({ siteId: webVitalsDaily.siteId });
  await db.delete(webVitalsUsage).where(lt(webVitalsUsage.day, cutoff));
  return removed.length;
}

/* ---------- Setup ---------- */

/** The reporting key and where it may be used from. Creates the key on first visit. */
export async function getPerformanceSetup(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<PerformanceSetup> {
  await requirePermission(db, userId, siteId, "performance.view");
  let [site] = await db
    .select({ key: sites.vitalsKey, domain: sites.domain, previewUrl: sites.previewUrl })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (!site.key) {
    // Only fills an empty key, so two first visits can't overwrite each other.
    await db
      .update(sites)
      .set({ vitalsKey: newIngestKey() })
      .where(and(eq(sites.id, siteId), isNull(sites.vitalsKey)));
    [site] = await db
      .select({ key: sites.vitalsKey, domain: sites.domain, previewUrl: sites.previewUrl })
      .from(sites)
      .where(eq(sites.id, siteId));
  }
  const [last] = await db
    .select({ day: max(webVitalsUsage.day) })
    .from(webVitalsUsage)
    .where(eq(webVitalsUsage.siteId, siteId));
  let previewOrigin: string | null = null;
  try {
    previewOrigin = site.previewUrl ? new URL(site.previewUrl).origin : null;
  } catch {
    previewOrigin = null;
  }
  return {
    ingestKey: site.key!,
    domain: site.domain,
    previewOrigin,
    origins: allowedOrigins(site.domain, site.previewUrl),
    lastReceivedOn: last?.day ?? null,
  };
}

/** Replaces the reporting key; the old one stops working immediately. */
export async function rotateIngestKey(db: DbOrTx, userId: string, siteId: string) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, userId, siteId, "performance.manage");
    const key = newIngestKey();
    await tx.update(sites).set({ vitalsKey: key }).where(eq(sites.id, siteId));
    await recordActivity(tx, {
      siteId,
      actorId: userId,
      action: "performance.key_rotated",
      targetType: "site",
      targetId: siteId,
    });
    return key;
  });
}

/* ---------- Reports ---------- */

export interface PerformanceQuery {
  device: DeviceFilter;
  days: Period;
}

function rangeWhere(siteId: string, query: PerformanceQuery, now: Date) {
  return and(
    eq(webVitalsDaily.siteId, siteId),
    gte(webVitalsDaily.day, daysBefore(now, query.days - 1)),
    query.device === "all" ? undefined : eq(webVitalsDaily.device, query.device),
  );
}

const countCol = sql<number>`sum(${webVitalsDaily.count})::int`;
const sumCol = sql<number>`sum(${webVitalsDaily.sum})::float8`;

function summarize(metric: Metric, buckets: Bucket[]): MetricSummary {
  const samples = buckets.reduce((n, b) => n + b.count, 0);
  const p75 = percentile(metric, buckets);
  return {
    metric,
    p75,
    samples,
    rating: p75 === null ? null : rate(metric, p75),
    shares: distribution(metric, buckets),
  };
}

const isMetric = (value: string): value is Metric => (METRICS as readonly string[]).includes(value);

/** Published entries by their public path, to link measured pages to content. */
async function entriesByPath(db: DbOrTx, siteId: string) {
  const rows = await db
    .select({
      id: contentEntries.id,
      title: contentEntries.title,
      slug: contentEntries.slug,
      modelKey: contentModels.key,
      publishedAt: contentEntries.publishedAt,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.status, "published")))
    .orderBy(desc(contentEntries.updatedAt))
    .limit(5000);
  const rules = await loadPathRules(db, siteId);
  const map = new Map<string, { id: string; title: string }>();
  for (const row of rows) {
    const path = entryPath(rules, row.modelKey, row.slug, entryDate(row));
    if (!map.has(path)) map.set(path, { id: row.id, title: row.title });
  }
  return map;
}

export interface PerformanceReport {
  summaries: MetricSummary[];
  daily: Record<Metric, DailyPoint[]>;
  pages: PagePerformance[];
  /** Pages measured in the period (pages may be cut to the worst ones). */
  pageCount: number;
  lastReceivedOn: string | null;
  days: Period;
  device: DeviceFilter;
  /** First and last day of the period (UTC). */
  from: string;
  to: string;
}

export async function getPerformanceReport(
  db: DbOrTx,
  userId: string,
  siteId: string,
  query: PerformanceQuery,
  now = new Date(),
): Promise<PerformanceReport> {
  await requirePermission(db, userId, siteId, "performance.view");
  const where = rangeWhere(siteId, query, now);
  const [totals, dailyRows, pageRows, [last], entries] = await Promise.all([
    db
      .select({
        metric: webVitalsDaily.metric,
        bucket: webVitalsDaily.bucket,
        count: countCol,
        sum: sumCol,
      })
      .from(webVitalsDaily)
      .where(where)
      .groupBy(webVitalsDaily.metric, webVitalsDaily.bucket),
    db
      .select({
        day: webVitalsDaily.day,
        metric: webVitalsDaily.metric,
        bucket: webVitalsDaily.bucket,
        count: countCol,
        sum: sumCol,
      })
      .from(webVitalsDaily)
      .where(where)
      .groupBy(webVitalsDaily.day, webVitalsDaily.metric, webVitalsDaily.bucket),
    db
      .select({
        path: webVitalsDaily.path,
        metric: webVitalsDaily.metric,
        bucket: webVitalsDaily.bucket,
        count: countCol,
        sum: sumCol,
      })
      .from(webVitalsDaily)
      .where(where)
      .groupBy(webVitalsDaily.path, webVitalsDaily.metric, webVitalsDaily.bucket),
    db
      .select({ day: max(webVitalsUsage.day) })
      .from(webVitalsUsage)
      .where(eq(webVitalsUsage.siteId, siteId)),
    entriesByPath(db, siteId),
  ]);

  const bucketsBy = (
    rows: { key: string; metric: string; bucket: number; count: number; sum: number }[],
  ) => {
    const map = new Map<string, Map<Metric, Bucket[]>>();
    for (const row of rows) {
      if (!isMetric(row.metric)) continue;
      const perMetric = map.get(row.key) ?? new Map<Metric, Bucket[]>();
      const list = perMetric.get(row.metric) ?? [];
      list.push({ index: row.bucket, count: Number(row.count), sum: Number(row.sum) });
      perMetric.set(row.metric, list);
      map.set(row.key, perMetric);
    }
    return map;
  };

  const all =
    bucketsBy(totals.map((row) => ({ ...row, key: "all" }))).get("all") ??
    new Map<Metric, Bucket[]>();
  const summaries = METRICS.map((metric) => summarize(metric, all.get(metric) ?? []));

  const from = daysBefore(now, query.days - 1);
  const to = dayOf(now);
  const byDay = bucketsBy(dailyRows.map((row) => ({ ...row, key: row.day })));
  const daily = Object.fromEntries(
    METRICS.map((metric) => {
      const points: DailyPoint[] = [];
      for (let i = query.days - 1; i >= 0; i--) {
        const day = daysBefore(now, i);
        const buckets = byDay.get(day)?.get(metric) ?? [];
        points.push({
          day,
          p75: percentile(metric, buckets),
          samples: buckets.reduce((n, b) => n + b.count, 0),
        });
      }
      return [metric, points];
    }),
  ) as Record<Metric, DailyPoint[]>;

  const byPath = bucketsBy(pageRows.map((row) => ({ ...row, key: row.path })));
  const pages: PagePerformance[] = [...byPath.entries()].map(([path, perMetric]) => {
    const metrics: PagePerformance["metrics"] = {};
    let samples = 0;
    for (const [metric, buckets] of perMetric) {
      const p75 = percentile(metric, buckets);
      const count = buckets.reduce((n, b) => n + b.count, 0);
      if (metric === "LCP") samples = count;
      if (p75 !== null) metrics[metric] = { p75, samples: count, rating: rate(metric, p75) };
    }
    if (samples === 0) samples = Math.max(0, ...Object.values(metrics).map((m) => m.samples));
    const entry = entries.get(path);
    return {
      path,
      entryId: entry?.id ?? null,
      title: entry?.title ?? null,
      metrics,
      samples,
      worst: worstRating(CORE_METRICS.map((metric) => metrics[metric]?.rating)),
    };
  });
  const severity = (rating: Rating | null) =>
    rating === "poor" ? 0 : rating === "needs-improvement" ? 1 : rating === "good" ? 2 : 3;
  pages.sort(
    (a, b) =>
      severity(a.worst) - severity(b.worst) ||
      (b.metrics.LCP?.p75 ?? 0) / METRIC_INFO.LCP.good -
        (a.metrics.LCP?.p75 ?? 0) / METRIC_INFO.LCP.good ||
      b.samples - a.samples,
  );

  return {
    summaries,
    daily,
    pages: pages.slice(0, PAGE_LIMIT),
    pageCount: pages.length,
    lastReceivedOn: last?.day ?? null,
    days: query.days,
    device: query.device,
    from,
    to,
  };
}

/** Core Web Vitals for the last 28 days, for the site Overview. */
export async function getPerformanceSummary(
  db: DbOrTx,
  userId: string,
  siteId: string,
  now = new Date(),
) {
  await requirePermission(db, userId, siteId, "performance.view");
  const rows = await db
    .select({
      metric: webVitalsDaily.metric,
      bucket: webVitalsDaily.bucket,
      count: countCol,
      sum: sumCol,
    })
    .from(webVitalsDaily)
    .where(
      and(
        eq(webVitalsDaily.siteId, siteId),
        gte(webVitalsDaily.day, daysBefore(now, 27)),
        inArray(webVitalsDaily.metric, [...CORE_METRICS]),
      ),
    )
    .groupBy(webVitalsDaily.metric, webVitalsDaily.bucket);
  const summaries = CORE_METRICS.map((metric) =>
    summarize(
      metric,
      rows
        .filter((row) => row.metric === metric)
        .map((row) => ({ index: row.bucket, count: Number(row.count), sum: Number(row.sum) })),
    ),
  );
  return { connected: summaries.some((s) => s.samples > 0), summaries };
}

/* ---------- Assets ---------- */

export async function getAssetReport(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<{ findings: AssetFinding[]; imageCount: number; totalBytes: number }> {
  await requirePermission(db, userId, siteId, "performance.view");
  const rows = await db
    .select({
      id: mediaAssets.id,
      filename: mediaAssets.filename,
      url: mediaAssets.url,
      mimeType: mediaAssets.mimeType,
      sizeBytes: mediaAssets.sizeBytes,
      width: mediaAssets.width,
      height: mediaAssets.height,
      altText: mediaAssets.altText,
      createdAt: mediaAssets.createdAt,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.siteId, siteId))
    .orderBy(desc(mediaAssets.sizeBytes))
    .limit(2000);
  const images = rows.filter((row) => isImageType(row.mimeType));
  const flagged = images
    .map((row) => {
      const issues: AssetIssue[] = [];
      if (row.sizeBytes > LARGE_IMAGE_BYTES) issues.push("large_file");
      if (row.width !== null && row.width > LARGE_IMAGE_WIDTH) issues.push("too_wide");
      if (row.width === null || row.height === null) issues.push("no_dimensions");
      if (!row.altText?.trim()) issues.push("no_alt");
      return { row, issues };
    })
    .filter((item) => item.issues.length > 0);
  const usage = await usageOf(
    db,
    siteId,
    flagged.map(({ row }) => ({ id: row.id, url: row.url })),
  );
  return {
    imageCount: images.length,
    totalBytes: images.reduce((n, row) => n + row.sizeBytes, 0),
    findings: flagged.map(({ row, issues }) => ({
      id: row.id,
      filename: row.filename,
      url: row.url,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
      issues,
      usage: usage.get(row.id) ?? [],
    })),
  };
}

/* ---------- Recommendations ---------- */

/**
 * Rule-based suggestions from the site's own measurements and media. Every
 * number shown comes from stored data; nothing is estimated.
 */
export function buildRecommendations(
  report: PerformanceReport,
  assets: Awaited<ReturnType<typeof getAssetReport>>,
): Recommendation[] {
  const format = formatMetric;
  const recs: Recommendation[] = [];
  const bySeverity = (metric: Metric) =>
    report.pages.filter((page) => page.metrics[metric] && page.metrics[metric]!.rating !== "good");
  const pageItem = (page: PagePerformance, metric: Metric) => ({
    path: page.path,
    entryId: page.entryId,
    title: page.title,
    value: format(metric, page.metrics[metric]!.p75),
  });
  const worst = (pages: PagePerformance[], metric: Metric): Rating =>
    pages.some((page) => page.metrics[metric]?.rating === "poor") ? "poor" : "needs-improvement";

  const largeByEntry = new Map<string, AssetFinding[]>();
  const noDimsByEntry = new Map<string, AssetFinding[]>();
  for (const asset of assets.findings) {
    for (const use of asset.usage) {
      if (asset.issues.includes("large_file") || asset.issues.includes("too_wide")) {
        largeByEntry.set(use.id, [...(largeByEntry.get(use.id) ?? []), asset]);
      }
      if (asset.issues.includes("no_dimensions")) {
        noDimsByEntry.set(use.id, [...(noDimsByEntry.get(use.id) ?? []), asset]);
      }
    }
  }
  const assetItems = (list: AssetFinding[]) =>
    [...new Map(list.map((asset) => [asset.id, asset])).values()].slice(0, 5).map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      detail:
        `${Math.round(asset.sizeBytes / 1024)} KB` +
        (asset.width ? ` · ${asset.width}px wide` : ""),
    }));

  const slowLcp = bySeverity("LCP");
  const lcpWithImages = slowLcp.filter((page) => page.entryId && largeByEntry.has(page.entryId));
  if (lcpWithImages.length > 0) {
    recs.push({
      key: "lcp-images",
      severity: worst(lcpWithImages, "LCP"),
      title: "Shrink the large images on slow-loading pages",
      why: `${lcpWithImages.length} ${lcpWithImages.length === 1 ? "page loads" : "pages load"} slowly (LCP above ${format("LCP", METRIC_INFO.LCP.good)}) and ${lcpWithImages.length === 1 ? "uses" : "use"} images over ${LARGE_IMAGE_BYTES / 1024} KB or ${LARGE_IMAGE_WIDTH}px wide. The biggest image is often what visitors wait for.`,
      fix: "Replace these images with smaller versions (about 1600px wide is plenty for most layouts), or have your website request resized copies.",
      pages: lcpWithImages.slice(0, 5).map((page) => pageItem(page, "LCP")),
      assets: assetItems(lcpWithImages.flatMap((page) => largeByEntry.get(page.entryId!) ?? [])),
      learnMore: "https://web.dev/articles/optimize-lcp",
    });
  }
  const lcpOther = slowLcp.filter((page) => !lcpWithImages.includes(page));
  if (lcpOther.length > 0) {
    recs.push({
      key: "lcp",
      severity: worst(lcpOther, "LCP"),
      title: "Speed up how fast the main content appears",
      why: `${lcpOther.length} ${lcpOther.length === 1 ? "page takes" : "pages take"} longer than ${format("LCP", METRIC_INFO.LCP.good)} for 1 in 4 visitors to see the main content.`,
      fix: "Ask your developer to load the hero image or headline first (preload it, don't lazy-load it), and to render pages on the server or ahead of time.",
      pages: lcpOther.slice(0, 5).map((page) => pageItem(page, "LCP")),
      assets: [],
      learnMore: "https://web.dev/articles/optimize-lcp",
    });
  }

  const shifting = bySeverity("CLS");
  const clsWithImages = shifting.filter((page) => page.entryId && noDimsByEntry.has(page.entryId));
  if (clsWithImages.length > 0) {
    recs.push({
      key: "cls-dimensions",
      severity: worst(clsWithImages, "CLS"),
      title: "Give images a width and height",
      why: `${clsWithImages.length} ${clsWithImages.length === 1 ? "page jumps" : "pages jump"} around while loading and ${clsWithImages.length === 1 ? "uses" : "use"} images Klipt has no dimensions for, so the browser can't reserve their space.`,
      fix: "Upload these images again so Klipt records their size; the content API then sends width and height for your website to use.",
      pages: clsWithImages.slice(0, 5).map((page) => pageItem(page, "CLS")),
      assets: assetItems(clsWithImages.flatMap((page) => noDimsByEntry.get(page.entryId!) ?? [])),
      learnMore: "https://web.dev/articles/optimize-cls",
    });
  }
  const clsOther = shifting.filter((page) => !clsWithImages.includes(page));
  if (clsOther.length > 0) {
    recs.push({
      key: "cls",
      severity: worst(clsOther, "CLS"),
      title: "Stop the layout from shifting",
      why: `${clsOther.length} ${clsOther.length === 1 ? "page moves" : "pages move"} noticeably while loading (CLS above ${format("CLS", METRIC_INFO.CLS.good)}).`,
      fix: "Reserve space for images, ads and embeds, and avoid inserting banners above content after the page appears.",
      pages: clsOther.slice(0, 5).map((page) => pageItem(page, "CLS")),
      assets: [],
      learnMore: "https://web.dev/articles/optimize-cls",
    });
  }

  const ttfb = report.summaries.find((s) => s.metric === "TTFB");
  if (ttfb?.p75 !== null && ttfb?.p75 !== undefined && ttfb.rating !== "good") {
    recs.push({
      key: "ttfb",
      severity: ttfb.rating ?? "needs-improvement",
      title: "Make your website's server respond faster",
      why: `1 in 4 visits waits more than ${format("TTFB", ttfb.p75)} for the first byte (the target is under ${format("TTFB", METRIC_INFO.TTFB.good)}).`,
      fix: "Cache pages instead of building them on every visit: render ahead of time (static or ISR) and refresh when Klipt's webhooks say content changed. Klipt's content API responses can be cached on your server too.",
      pages: bySeverity("TTFB")
        .slice(0, 5)
        .map((page) => pageItem(page, "TTFB")),
      assets: [],
      learnMore: "https://web.dev/articles/optimize-ttfb",
    });
  }

  const slowInp = bySeverity("INP");
  if (slowInp.length > 0) {
    recs.push({
      key: "inp",
      severity: worst(slowInp, "INP"),
      title: "Make taps and clicks respond sooner",
      why: `${slowInp.length} ${slowInp.length === 1 ? "page reacts" : "pages react"} slowly to interactions (INP above ${format("INP", METRIC_INFO.INP.good)}).`,
      fix: "Usually caused by heavy JavaScript: ask your developer to split long tasks, defer third-party scripts and remove unused ones.",
      pages: slowInp.slice(0, 5).map((page) => pageItem(page, "INP")),
      assets: [],
      learnMore: "https://web.dev/articles/optimize-inp",
    });
  }

  const big = assets.findings.filter(
    (asset) => asset.issues.includes("large_file") || asset.issues.includes("too_wide"),
  );
  if (big.length > 0) {
    recs.push({
      key: "large-images",
      severity: "info",
      title: "Resize oversized images in the media library",
      why: `${big.length} ${big.length === 1 ? "image is" : "images are"} over ${LARGE_IMAGE_BYTES / 1024} KB or ${LARGE_IMAGE_WIDTH}px wide. Klipt now shrinks large photos when they're uploaded, so these are usually older uploads.`,
      fix: "Download, resize and upload them again, then swap them into the content that uses them.",
      pages: [],
      assets: assetItems(big),
      learnMore: "https://web.dev/articles/serve-images-with-correct-dimensions",
    });
  }

  const order = { poor: 0, "needs-improvement": 1, good: 2, info: 3 } as const;
  return recs.sort((a, b) => order[a.severity] - order[b.severity]);
}
