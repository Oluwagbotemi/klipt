import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { contentEntries, siteMembers, users, webhookDeliveries } from "@/server/db/schema";
import { createApiKey } from "@/server/api-keys";
import { createEntry } from "@/server/content";
import { getEntryDocument, saveEntry, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { getSiteOverview } from "@/server/overview";
import { createSite } from "@/server/sites";
import { createWebhook } from "@/server/webhooks";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-overview-0123456789";
process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1";

let db: Database;
let siteId: string;

const words = (n: number) => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: Array(n).fill("word").join(" ") }] },
  ],
});

async function entry(
  title: string,
  options: {
    as?: string;
    type?: "post" | "page";
    seo?: object;
    body?: object;
    then?: "publish" | "submit" | "schedule";
  } = {},
) {
  const as = options.as ?? "owner";
  const { id } = await createEntry(db, as, siteId, options.type ?? "post", title);
  const version = async () => (await getEntryDocument(db, as, siteId, id))!.entry.updatedAt;
  await saveEntry(db, as, siteId, id, {
    title,
    body: options.body ?? words(80),
    seo: options.seo ?? { description: "A good description of this entry." },
    expectedUpdatedAt: await version(),
  });
  if (options.then) {
    await transitionEntry(db, as, siteId, id, {
      action: options.then,
      scheduledAt:
        options.then === "schedule" ? new Date(Date.now() + 3_600_000).toISOString() : undefined,
      expectedUpdatedAt: await version(),
    });
  }
  return id;
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "author", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Site", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

describe("site overview", () => {
  test("non-members are refused", async () => {
    await assert.rejects(getSiteOverview(db, "stranger", siteId), NotAllowedError);
  });

  test("a new site shows empty counts and the setup checklist", async () => {
    const overview = await getSiteOverview(db, "owner", siteId);
    assert.deepEqual(overview.counts, { published: 0, draft: 0, in_review: 0, scheduled: 0 });
    assert.deepEqual(
      overview.setup?.map((s) => [s.key, s.done]),
      [
        ["publish", false],
        ["media", false],
        ["api_key", false],
        ["webhook", false],
      ],
    );
    assert.deepEqual(overview.seoIssues, []);
    assert.equal((await getSiteOverview(db, "viewer", siteId)).setup, null);
  });

  test("counts, review queue, schedule, SEO issues and activity", async () => {
    await entry("Good post", { then: "publish" });
    await entry("No description", { seo: {}, then: "publish" });
    await entry("Short", { body: words(10), then: "publish" });
    await entry("A very long SEO title that goes well beyond what results usually show", {
      then: "publish",
    });
    await entry("Hidden", {
      type: "page",
      seo: { description: "Hidden page.", index: false },
      then: "publish",
    });
    await entry("Waiting for review", { as: "author", then: "submit" });
    await entry("Later", { then: "schedule" });
    await entry("Just a draft");

    const overview = await getSiteOverview(db, "owner", siteId);
    assert.deepEqual(overview.counts, { published: 5, draft: 1, in_review: 1, scheduled: 1 });
    assert.deepEqual(
      overview.inReview.map((e) => [e.title, e.authorName]),
      [["Waiting for review", "User author"]],
    );
    assert.deepEqual(
      overview.upcoming.map((e) => e.title),
      ["Later"],
    );
    assert.ok(overview.upcoming[0].scheduledAt);
    assert.equal(overview.recent[0].title, "Just a draft");

    const issues = Object.fromEntries(
      overview.seoIssues.map((i) => [i.key, i.examples.map((e) => e.title)]),
    );
    assert.deepEqual(issues.missing_description, ["No description"]);
    assert.deepEqual(issues.long_title, [
      "A very long SEO title that goes well beyond what results usually show",
    ]);
    assert.deepEqual(issues.thin_content, ["Short"]);
    assert.deepEqual(issues.noindex, ["Hidden"]);
    // The sample posts share one description, which is flagged too.
    assert.ok(issues.duplicate_description?.length);
    assert.equal(overview.allowIndexing, true);

    const first = overview.activity[0];
    assert.equal(first.action, "content.created");
    assert.equal(first.targetTitle, "Just a draft");
    assert.equal(first.actorName, "User owner");
    assert.ok(first.entryId);
    assert.ok(overview.activity.some((a) => a.action === "content.published"));
    assert.equal(overview.setup?.find((s) => s.key === "publish")?.done, true);
  });

  test("integration activity and webhook failures are for managers only", async () => {
    await createApiKey(db, "owner", siteId, "Website");
    const { id } = await createWebhook(db, "owner", siteId, {
      url: "http://127.0.0.1:1/hook",
      events: ["entry.published"],
    });
    await db.insert(webhookDeliveries).values({
      siteId,
      webhookId: id,
      event: "entry.published",
      payload: {},
      status: "failed",
      attempts: 6,
    });
    const owner = await getSiteOverview(db, "owner", siteId);
    assert.equal(owner.webhookFailures, 1);
    assert.ok(owner.activity.some((a) => a.action === "webhook.created"));
    assert.equal(owner.setup?.find((s) => s.key === "api_key")?.done, true);

    const viewer = await getSiteOverview(db, "viewer", siteId);
    assert.equal(viewer.webhookFailures, null);
    assert.ok(!viewer.activity.some((a) => /^(api_key|webhook)\./.test(a.action)));
  });

  test("due scheduled entries are published before counting", async () => {
    const id = await entry("Due now", { then: "schedule" });
    await db
      .update(contentEntries)
      .set({ scheduledAt: new Date(Date.now() - 1000) })
      .where(eq(contentEntries.id, id));
    const overview = await getSiteOverview(db, "owner", siteId);
    assert.ok(!overview.upcoming.some((e) => e.title === "Due now"));
    assert.equal(overview.counts.published, 6);
  });
});
