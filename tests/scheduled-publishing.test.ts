import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import { and, eq, isNull } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { auditEvents, contentEntries, users, webhookDeliveries } from "@/server/db/schema";
import { listActivity } from "@/server/activity";
import { createEntry } from "@/server/content";
import { isCronAuthorized } from "@/server/cron-auth";
import {
  getEntryDocument,
  publishAllDueEntries,
  publishDueEntries,
  SCHEDULER_ACTOR,
  transitionEntry,
} from "@/server/editor";
import { getLastSchedulerRun, getSiteSchedule, runScheduler } from "@/server/scheduler";
import { createSite } from "@/server/sites";
import { createWebhook } from "@/server/webhooks";
import { describeActivity, parseActivityParams } from "@/lib/activity";
import { isSchedulerConnected, SCHEDULER_CONNECTED_MS } from "@/lib/scheduler";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-webhook-encryption-0123456789";

let db: Database;
let siteA: string;
let siteB: string;
let server: Server;
let hits = 0;

/** Creates an entry scheduled for `minutesAgo` minutes in the past (due now). */
async function scheduledEntry(siteId: string, title: string, minutesAgo = 1) {
  const { id } = await createEntry(db, "owner", siteId, "post", title);
  const doc = await getEntryDocument(db, "owner", siteId, id);
  assert.ok(doc);
  await transitionEntry(db, "owner", siteId, id, {
    action: "schedule",
    scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    expectedUpdatedAt: doc.entry.updatedAt,
  });
  const when = new Date(Date.now() - minutesAgo * 60_000);
  when.setMilliseconds(0);
  await db.update(contentEntries).set({ scheduledAt: when }).where(eq(contentEntries.id, id));
  return { id, when };
}

async function entryRow(id: string) {
  const [row] = await db.select().from(contentEntries).where(eq(contentEntries.id, id));
  return row;
}

const deliveriesFor = async (entryId: string) =>
  (await db.select().from(webhookDeliveries)).filter(
    (row) =>
      row.event === "entry.published" &&
      (row.payload.data as { entry?: { id?: string } }).entry?.id === entryId,
  );

const scheduledActivity = async (entryId: string) =>
  (await db.select().from(auditEvents).where(eq(auditEvents.targetId, entryId))).filter(
    (row) => row.action === "content.published",
  );

before(async () => {
  process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1";
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      hits += 1;
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  db = await createPgliteDatabase("memory://", { migrate: true });
  await db.insert(users).values({ id: "owner", name: "Sam", email: "owner@test.local" });
  siteA = (await createSite(db, "owner", { name: "Blog A", domain: "a.example" })).id;
  siteB = (await createSite(db, "owner", { name: "Blog B", domain: "b.example" })).id;
  for (const siteId of [siteA, siteB]) {
    await createWebhook(db, "owner", siteId, {
      url: `${baseUrl}/hook`,
      events: ["entry.published"],
    });
  }
});

after(() => server.close());

beforeEach(() => {
  hits = 0;
});

describe("scheduled publishing", () => {
  test("publishes due entries on every site at their scheduled time and sends webhooks", async () => {
    const a = await scheduledEntry(siteA, "Morning post", 3);
    const b = await scheduledEntry(siteB, "Other site post", 1);
    const result = await runScheduler(db);
    assert.equal(result.published, 2);
    assert.equal(result.sites, 2);
    assert.equal(result.webhooksSent, 2);
    assert.equal(hits, 2);

    for (const { id, when } of [a, b]) {
      const row = await entryRow(id);
      assert.equal(row.status, "published");
      assert.equal(row.scheduledAt, null);
      // publishedAt is the scheduled time, not the time the scheduler ran.
      assert.equal(row.publishedAt?.getTime(), when.getTime());
      const deliveries = await deliveriesFor(id);
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].status, "succeeded");
    }
  });

  test("leaves future entries alone and is cheap when nothing is due", async () => {
    const { id } = await createEntry(db, "owner", siteA, "post", "Next week");
    const doc = await getEntryDocument(db, "owner", siteA, id);
    assert.ok(doc);
    await transitionEntry(db, "owner", siteA, id, {
      action: "schedule",
      scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      expectedUpdatedAt: doc.entry.updatedAt,
    });
    const result = await runScheduler(db);
    assert.deepEqual(
      { published: result.published, sites: result.sites, webhooksSent: result.webhooksSent },
      { published: 0, sites: 0, webhooksSent: 0 },
    );
    assert.equal((await entryRow(id)).status, "scheduled");
    const schedule = await getSiteSchedule(db, siteA);
    assert.equal(schedule.scheduledCount, 1);
    assert.ok(schedule.nextScheduledAt);
  });

  test("concurrent runs publish, log and announce each entry once", async () => {
    const { id } = await scheduledEntry(siteA, "Raced post");
    const results = await Promise.all([
      runScheduler(db),
      runScheduler(db),
      publishAllDueEntries(db),
      publishDueEntries(db, siteA),
    ]);
    const total =
      results[0].published + results[1].published + results[2].published + (results[3] as number);
    assert.equal(total, 1);
    assert.equal((await deliveriesFor(id)).length, 1);
    assert.equal((await scheduledActivity(id)).length, 1);
  });

  test("a read publishes a due entry once, and the scheduler then finds nothing", async () => {
    const { id } = await scheduledEntry(siteB, "Read first");
    await getEntryDocument(db, "owner", siteB, id);
    const result = await runScheduler(db);
    assert.equal(result.published, 0);
    assert.equal((await deliveriesFor(id)).length, 1);
  });

  test("Activity says Klipt published it as scheduled", async () => {
    const { id } = await scheduledEntry(siteA, "Logged post");
    await runScheduler(db);
    const [row] = await scheduledActivity(id);
    assert.equal(row.actorId, null);
    assert.equal(row.actorName, SCHEDULER_ACTOR);
    assert.deepEqual(row.metadata, { title: "Logged post", from: "scheduled" });

    const feed = await listActivity(db, "owner", siteA, parseActivityParams({}));
    const item = feed.items.find((entry) => entry.target === "Logged post");
    assert.ok(item);
    assert.equal(item.actorName, "Klipt");
    assert.equal(item.verb, "published");
    assert.equal(item.detail, "as scheduled");
    assert.deepEqual(describeActivity("content.published", { title: "X", from: "scheduled" }), {
      verb: "published",
      target: "X",
      detail: "as scheduled",
    });
  });

  test("keeps one last-run record, outside every site's Activity", async () => {
    const at = new Date();
    await runScheduler(db, { now: at });
    await runScheduler(db, { now: new Date(at.getTime() + 60_000) });
    const rows = await db
      .select()
      .from(auditEvents)
      .where(and(isNull(auditEvents.siteId), eq(auditEvents.action, "scheduler.ran")));
    assert.equal(rows.length, 1);
    const run = await getLastSchedulerRun(db);
    assert.ok(run);
    assert.equal(Date.parse(run.at), at.getTime() + 60_000);

    const feed = await listActivity(db, "owner", siteA, parseActivityParams({}));
    assert.ok(feed.items.every((item) => item.action !== "scheduler.ran"));
  });

  test("counts as connected only after a recent run", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    const run = (minutesAgo: number) => ({
      at: new Date(now - minutesAgo * 60_000).toISOString(),
      published: 0,
      webhooksSent: 0,
    });
    assert.equal(isSchedulerConnected(null, now), false);
    assert.equal(isSchedulerConnected(run(1), now), true);
    assert.equal(isSchedulerConnected(run(4), now), true);
    assert.equal(isSchedulerConnected(run(SCHEDULER_CONNECTED_MS / 60_000 + 1), now), false);
  });

  test("the endpoint needs the cron secret", () => {
    const previous = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      assert.equal(isCronAuthorized("Bearer anything"), false);
      process.env.CRON_SECRET = "s3cret-value";
      assert.equal(isCronAuthorized(null), false);
      assert.equal(isCronAuthorized("Bearer wrong"), false);
      assert.equal(isCronAuthorized("s3cret-value"), false);
      assert.equal(isCronAuthorized("Bearer s3cret-value"), true);
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });
});
