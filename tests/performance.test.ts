import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import {
  auditEvents,
  contentEntries,
  mediaAssets,
  siteMembers,
  sites,
  users,
  webVitalsDaily,
  webVitalsUsage,
} from "@/server/db/schema";
import { createEntry } from "@/server/content";
import { getEntryDocument, saveEntry, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import {
  buildRecommendations,
  dayOf,
  getAssetReport,
  getPerformanceReport,
  getPerformanceSetup,
  getPerformanceSummary,
  IngestError,
  ingestVitals,
  pruneVitals,
  rotateIngestKey,
  type IngestInput,
} from "@/server/performance";
import { createSite } from "@/server/sites";
import {
  allowedOrigins,
  bucketIndex,
  cleanVitalsPath,
  distribution,
  formatMetric,
  METRIC_INFO,
  OTHER_PATH,
  percentile,
  rate,
  VITALS_LIMITS,
  vitalsPayloadSchema,
  type Bucket,
  type Metric,
} from "@/lib/performance";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-performance-0123456789";

let db: Database;
let siteId: string;
let key: string;
const ORIGIN = "https://shop.example";
const NOW = new Date("2026-10-20T12:00:00Z");

const send = (events: IngestInput["events"], options: Partial<IngestInput> = {}, now = NOW) =>
  ingestVitals(db, { key, origin: ORIGIN, events, fallbackDevice: "desktop", ...options }, now);

/** Buckets for a list of raw values, as ingest would store them. */
function bucketsFor(metric: Metric, values: number[]): Bucket[] {
  const map = new Map<number, Bucket>();
  for (const value of values) {
    const index = bucketIndex(metric, value);
    const bucket = map.get(index) ?? { index, count: 0, sum: 0 };
    bucket.count++;
    bucket.sum += value;
    map.set(index, bucket);
  }
  return [...map.values()];
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "author", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Shop", domain: "shop.example" })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
  key = (await getPerformanceSetup(db, "owner", siteId)).ingestKey;
});

describe("percentile math", () => {
  test("p75 from buckets stays within one bucket of the exact value", () => {
    const values = Array.from({ length: 400 }, (_, i) => 500 + i * 10); // 500..4490 ms
    const exact = [...values].sort((a, b) => a - b)[Math.ceil(0.75 * values.length) - 1];
    const estimate = percentile("LCP", bucketsFor("LCP", values))!;
    assert.ok(Math.abs(estimate - exact) <= 500, `${estimate} vs ${exact}`);
  });

  test("values on a threshold count as good, just above as needs improvement", () => {
    assert.equal(rate("LCP", 2500), "good");
    assert.equal(rate("LCP", 2501), "needs-improvement");
    assert.equal(rate("CLS", 0.25), "needs-improvement");
    assert.equal(rate("CLS", 0.26), "poor");
    const shares = distribution("INP", bucketsFor("INP", [200, 201, 500, 501]));
    assert.deepEqual(shares, { good: 1, "needs-improvement": 2, poor: 1 });
  });

  test("formatting never shows a value just over a threshold as the threshold", () => {
    assert.equal(formatMetric("LCP", 2400), "2.4\u00a0s");
    assert.equal(formatMetric("LCP", 2510), "2.51\u00a0s");
    assert.equal(formatMetric("LCP", 2500), "2.5\u00a0s");
    assert.equal(formatMetric("INP", 200.4), "200.4\u00a0ms");
    assert.equal(formatMetric("CLS", 0.101), "0.101");
    assert.equal(formatMetric("CLS", 0.09), "0.09");
    assert.equal(formatMetric("TTFB", 12_345), "12\u00a0s");
    assert.equal(formatMetric("LCP", null), "–");
  });

  test("thresholds are bucket edges for every metric", () => {
    for (const [metric, info] of Object.entries(METRIC_INFO)) {
      assert.ok(info.edges.includes(info.good), `${metric} good`);
      assert.ok(info.edges.includes(info.poor), `${metric} poor`);
    }
  });

  test("an empty histogram has no percentile; the open last bucket uses its average", () => {
    assert.equal(percentile("LCP", []), null);
    assert.equal(percentile("LCP", bucketsFor("LCP", [40_000, 50_000])), 45_000);
  });
});

describe("ingest validation", () => {
  test("payloads are checked hard", () => {
    const ok = { key: "kpub_x", events: [{ metric: "LCP", value: 1200, path: "/" }] };
    assert.ok(vitalsPayloadSchema.safeParse(ok).success);
    const bad = [
      { ...ok, events: [] },
      { ...ok, events: [{ metric: "FID", value: 10, path: "/" }] },
      { ...ok, events: [{ metric: "LCP", value: -1, path: "/" }] },
      { ...ok, events: [{ metric: "CLS", value: 51, path: "/" }] },
      { ...ok, events: [{ metric: "LCP", value: Number.NaN, path: "/" }] },
      { ...ok, events: Array(VITALS_LIMITS.batch + 1).fill(ok.events[0]) },
      { events: ok.events },
    ];
    for (const payload of bad) assert.equal(vitalsPayloadSchema.safeParse(payload).success, false);
  });

  test("paths lose query strings, fragments and trailing slashes", () => {
    assert.equal(cleanVitalsPath("/posts/hello/?utm=1#top"), "/posts/hello");
    assert.equal(cleanVitalsPath("https://shop.example/a/b?email=x@y.z"), "/a/b");
    assert.equal(cleanVitalsPath("/"), "/");
    assert.equal(cleanVitalsPath("//evil.example/x"), null);
    assert.equal(cleanVitalsPath("javascript:alert(1)"), null);
    assert.equal(cleanVitalsPath(`/${"a".repeat(1000)}`)!.length, VITALS_LIMITS.pathLength);
  });

  test("allowed origins come from the domain (with and without www) and the preview site", () => {
    assert.deepEqual(allowedOrigins("www.shop.example", "https://preview.shop.example/api/p"), [
      "https://shop.example",
      "https://www.shop.example",
      "https://preview.shop.example",
    ]);
    assert.deepEqual(allowedOrigins(null, "http://evil.example"), []);
    assert.deepEqual(allowedOrigins(null, "http://localhost:3000/preview"), [
      "http://localhost:3000",
    ]);
  });
});

describe("ingest", () => {
  test("refuses unknown keys, other origins and sites without a domain", async () => {
    await assert.rejects(
      send([{ metric: "LCP", value: 1000, path: "/" }], { key: "kpub_nope" }),
      (error: IngestError) => error.status === 401,
    );
    await assert.rejects(
      send([{ metric: "LCP", value: 1000, path: "/" }], { origin: "https://evil.example" }),
      (error: IngestError) => error.status === 403 && error.code === "origin_not_allowed",
    );
    await assert.rejects(
      send([{ metric: "LCP", value: 1000, path: "/" }], { origin: null }),
      (error: IngestError) => error.status === 403,
    );
    const bare = (await createSite(db, "owner", { name: "Bare", domain: null })).id;
    const bareKey = (await getPerformanceSetup(db, "owner", bare)).ingestKey;
    await assert.rejects(
      send([{ metric: "LCP", value: 1000, path: "/" }], { key: bareKey }),
      (error: IngestError) => error.code === "no_domain",
    );
  });

  test("aggregates into daily buckets without storing raw events", async () => {
    const result = await send([
      { metric: "LCP", value: 1050, path: "/pricing?ref=x" },
      { metric: "LCP", value: 1100, path: "/pricing/" },
      { metric: "LCP", value: 5000, path: "/pricing", deviceType: "mobile" },
      { metric: "CLS", value: 0.3, path: "/pricing" },
    ]);
    assert.equal(result.accepted, 4);
    const rows = await db
      .select()
      .from(webVitalsDaily)
      .where(and(eq(webVitalsDaily.siteId, siteId), eq(webVitalsDaily.path, "/pricing")));
    const lcpDesktop = rows.filter((r) => r.metric === "LCP" && r.device === "desktop");
    assert.equal(lcpDesktop.length, 1); // 1000 and 1100 share a bucket
    assert.equal(lcpDesktop[0].count, 2);
    assert.equal(lcpDesktop[0].sum, 2150);
    assert.equal(rows.find((r) => r.metric === "LCP" && r.device === "mobile")?.count, 1);
    assert.equal(
      rows.every((r) => r.day === dayOf(NOW)),
      true,
    );

    // A second batch adds to the same rows.
    await send([{ metric: "LCP", value: 1050, path: "/pricing" }]);
    const [again] = await db
      .select()
      .from(webVitalsDaily)
      .where(
        and(
          eq(webVitalsDaily.siteId, siteId),
          eq(webVitalsDaily.path, "/pricing"),
          eq(webVitalsDaily.metric, "LCP"),
          eq(webVitalsDaily.device, "desktop"),
        ),
      );
    assert.equal(again.count, 3);
  });

  test("events with unusable paths are skipped, not failed", async () => {
    const result = await send([
      { metric: "LCP", value: 1000, path: "not a path" },
      { metric: "LCP", value: 1000, path: "/ok" },
    ]);
    assert.equal(result.accepted, 1);
  });

  test("a replaced key stops working; archived sites stop accepting", async () => {
    const old = key;
    const fresh = await rotateIngestKey(db, "admin", siteId);
    await assert.rejects(
      send([{ metric: "LCP", value: 1, path: "/" }], { key: old }),
      (error: IngestError) => error.status === 401,
    );
    key = fresh;
    assert.equal((await send([{ metric: "LCP", value: 1, path: "/" }])).accepted, 1);
    const [logged] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "performance.key_rotated"));
    assert.equal(logged.actorId, "admin");
    await assert.rejects(rotateIngestKey(db, "editor", siteId), NotAllowedError);

    const other = (await createSite(db, "owner", { name: "Old", domain: "old.example" })).id;
    const otherKey = (await getPerformanceSetup(db, "owner", other)).ingestKey;
    await db.update(sites).set({ archivedAt: new Date() }).where(eq(sites.id, other));
    await assert.rejects(
      send([{ metric: "LCP", value: 1, path: "/" }], {
        key: otherKey,
        origin: "https://old.example",
      }),
      (error: IngestError) => error.status === 401,
    );
  });

  test("daily caps: samples per site and distinct paths", async () => {
    const day = new Date("2026-10-01T08:00:00Z");
    await db.insert(webVitalsUsage).values({
      siteId,
      day: dayOf(day),
      samples: VITALS_LIMITS.dailySamples - 1,
    });
    const partial = await send(
      [
        { metric: "LCP", value: 1, path: "/a" },
        { metric: "LCP", value: 1, path: "/b" },
      ],
      {},
      day,
    );
    assert.equal(partial.accepted, 1);
    await assert.rejects(
      send([{ metric: "LCP", value: 1, path: "/c" }], {}, day),
      (error: IngestError) => error.status === 429,
    );

    // Paths past the daily limit are counted together.
    const pathDay = new Date("2026-10-02T08:00:00Z");
    await db.insert(webVitalsDaily).values(
      Array.from({ length: VITALS_LIMITS.dailyPaths }, (_, i) => ({
        siteId,
        day: dayOf(pathDay),
        path: `/p${i}`,
        metric: "LCP",
        device: "desktop",
        bucket: 0,
        count: 1,
        sum: 1,
      })),
    );
    await send(
      [
        { metric: "LCP", value: 1, path: "/p1" },
        { metric: "LCP", value: 1, path: "/brand-new" },
      ],
      {},
      pathDay,
    );
    const paths = await db
      .select({ path: webVitalsDaily.path })
      .from(webVitalsDaily)
      .where(and(eq(webVitalsDaily.siteId, siteId), eq(webVitalsDaily.day, dayOf(pathDay))));
    assert.ok(paths.some((r) => r.path === OTHER_PATH));
    assert.ok(!paths.some((r) => r.path === "/brand-new"));
  });

  test("data older than 90 days is pruned", async () => {
    const old = new Date("2026-06-01T00:00:00Z");
    await send([{ metric: "LCP", value: 1000, path: "/old" }], {}, old);
    const removed = await pruneVitals(db, NOW);
    assert.ok(removed >= 1);
    const left = await db
      .select()
      .from(webVitalsDaily)
      .where(and(eq(webVitalsDaily.siteId, siteId), eq(webVitalsDaily.path, "/old")));
    assert.equal(left.length, 0);
    const usage = await db
      .select()
      .from(webVitalsUsage)
      .where(and(eq(webVitalsUsage.siteId, siteId), eq(webVitalsUsage.day, dayOf(old))));
    assert.equal(usage.length, 0);
  });
});

describe("reports", () => {
  let reportSite: string;
  let reportKey: string;
  let postId: string;

  before(async () => {
    reportSite = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
    await db.insert(siteMembers).values([
      { siteId: reportSite, userId: "editor", role: "editor" },
      { siteId: reportSite, userId: "author", role: "author" },
    ]);
    reportKey = (await getPerformanceSetup(db, "owner", reportSite)).ingestKey;
    const created = await createEntry(db, "owner", reportSite, "post", "Big photos");
    postId = created.id;
    const version = async () =>
      (await getEntryDocument(db, "owner", reportSite, postId))!.entry.updatedAt;
    await saveEntry(db, "owner", reportSite, postId, {
      title: "Big photos",
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Photos." }] }],
      },
      seo: {},
      expectedUpdatedAt: await version(),
    });
    await transitionEntry(db, "owner", reportSite, postId, {
      action: "publish",
      expectedUpdatedAt: await version(),
    });
    const [doc] = await db
      .select({ slug: contentEntries.slug })
      .from(contentEntries)
      .where(eq(contentEntries.id, postId));
    const postPath = `/posts/${doc.slug}`;

    // Two days of measurements: the post is slow, the home page fast.
    for (const daysAgo of [0, 1]) {
      const at = new Date(NOW.getTime() - daysAgo * 86_400_000);
      await ingestVitals(
        db,
        {
          key: reportKey,
          origin: "https://blog.example",
          fallbackDevice: "mobile",
          events: [
            ...Array.from({ length: 20 }, (_, i) => ({
              metric: "LCP" as const,
              value: 4500 + i * 50,
              path: postPath,
            })),
            ...Array.from({ length: 20 }, () => ({
              metric: "CLS" as const,
              value: 0.02,
              path: postPath,
            })),
            ...Array.from({ length: 20 }, (_, i) => ({
              metric: "LCP" as const,
              value: 900 + i * 10,
              path: "/",
              deviceType: "desktop" as const,
            })),
            ...Array.from({ length: 10 }, () => ({
              metric: "TTFB" as const,
              value: 1500,
              path: "/",
            })),
          ],
        },
        at,
      );
    }
    // A large image used by the slow post, and one without a known size.
    await db.insert(mediaAssets).values([
      {
        id: "big-image",
        siteId: reportSite,
        storageKey: "k/big.jpg",
        url: "/media/k/big.jpg",
        filename: "big.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 900 * 1024,
        width: 4000,
        height: 3000,
        altText: "A big photo",
      },
      {
        id: "no-size",
        siteId: reportSite,
        storageKey: "k/nosize.png",
        url: "/media/k/nosize.png",
        filename: "nosize.png",
        mimeType: "image/png",
        sizeBytes: 10 * 1024,
        width: null,
        height: null,
        altText: null,
      },
      {
        id: "fine",
        siteId: reportSite,
        storageKey: "k/fine.png",
        url: "/media/k/fine.png",
        filename: "fine.png",
        mimeType: "image/png",
        sizeBytes: 10 * 1024,
        width: 800,
        height: 600,
        altText: "Fine",
      },
    ]);
    await db
      .update(contentEntries)
      .set({
        data: {
          body: {
            type: "doc",
            content: [{ type: "image", attrs: { mediaId: "big-image", src: "/media/k/big.jpg" } }],
          },
        },
      })
      .where(eq(contentEntries.id, postId));
  });

  test("only owners, admins and editors can see performance", async () => {
    await getPerformanceReport(db, "editor", reportSite, { device: "all", days: 28 }, NOW);
    for (const user of ["author", "stranger"]) {
      await assert.rejects(
        getPerformanceReport(db, user, reportSite, { device: "all", days: 28 }, NOW),
        NotAllowedError,
      );
      await assert.rejects(getPerformanceSetup(db, user, reportSite), NotAllowedError);
      await assert.rejects(getAssetReport(db, user, reportSite), NotAllowedError);
    }
    await assert.rejects(getPerformanceSummary(db, "viewer", siteId), NotAllowedError);
  });

  test("summaries, daily points and pages come from stored data", async () => {
    const report = await getPerformanceReport(
      db,
      "owner",
      reportSite,
      { device: "all", days: 7 },
      NOW,
    );
    const lcp = report.summaries.find((s) => s.metric === "LCP")!;
    assert.equal(lcp.samples, 80);
    assert.equal(report.daily.LCP.length, 7);
    assert.equal(report.daily.LCP.at(-1)!.samples, 40);
    assert.equal(report.daily.LCP[0].p75, null);
    assert.equal(report.pages[0].entryId, postId);
    assert.equal(report.pages[0].metrics.LCP?.rating, "poor");
    assert.equal(report.pages[0].worst, "poor");
    const home = report.pages.find((p) => p.path === "/")!;
    assert.equal(home.entryId, null);
    assert.equal(home.metrics.LCP?.rating, "good");
    assert.equal(report.lastReceivedOn, dayOf(NOW));

    const desktop = await getPerformanceReport(
      db,
      "owner",
      reportSite,
      { device: "desktop", days: 7 },
      NOW,
    );
    assert.equal(desktop.summaries.find((s) => s.metric === "LCP")!.samples, 40);
    assert.deepEqual(
      desktop.pages.map((p) => p.path),
      ["/"],
    );

    const summary = await getPerformanceSummary(db, "editor", reportSite, NOW);
    assert.equal(summary.connected, true);
    assert.deepEqual(
      summary.summaries.map((s) => s.metric),
      ["LCP", "INP", "CLS"],
    );
  });

  test("assets flag large, oversized and unsized images with their usage", async () => {
    const assets = await getAssetReport(db, "editor", reportSite);
    assert.equal(assets.imageCount, 3);
    const big = assets.findings.find((a) => a.id === "big-image")!;
    assert.deepEqual(big.issues, ["large_file", "too_wide"]);
    assert.deepEqual(
      big.usage.map((u) => u.id),
      [postId],
    );
    assert.deepEqual(assets.findings.find((a) => a.id === "no-size")!.issues, [
      "no_dimensions",
      "no_alt",
    ]);
    assert.equal(
      assets.findings.some((a) => a.id === "fine"),
      false,
    );
  });

  test("recommendations follow from the data, worst first", async () => {
    const report = await getPerformanceReport(
      db,
      "owner",
      reportSite,
      { device: "all", days: 28 },
      NOW,
    );
    const assets = await getAssetReport(db, "owner", reportSite);
    const recs = buildRecommendations(report, assets);
    const keys = recs.map((r) => r.key);
    assert.equal(keys[0], "lcp-images");
    assert.ok(keys.includes("ttfb"));
    assert.ok(keys.includes("large-images"));
    assert.ok(!keys.includes("inp"));
    assert.ok(!keys.includes("cls"));
    const lcp = recs[0];
    assert.equal(lcp.pages[0].entryId, postId);
    assert.deepEqual(
      lcp.assets.map((a) => a.id),
      ["big-image"],
    );
  });

  test("a site without measurements reports nothing", async () => {
    const empty = (await createSite(db, "owner", { name: "Empty", domain: "empty.example" })).id;
    const report = await getPerformanceReport(db, "owner", empty, { device: "all", days: 28 }, NOW);
    assert.equal(report.lastReceivedOn, null);
    assert.ok(report.summaries.every((s) => s.samples === 0 && s.p75 === null));
    assert.equal((await getPerformanceSummary(db, "owner", empty, NOW)).connected, false);
    const setup = await getPerformanceSetup(db, "owner", empty);
    assert.match(setup.ingestKey, /^kpub_/);
    assert.equal((await getPerformanceSetup(db, "owner", empty)).ingestKey, setup.ingestKey);
  });
});
