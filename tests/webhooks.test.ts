import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { siteMembers, users, webhookDeliveries, webhooks } from "@/server/db/schema";
import { applyBulkAction, createEntry } from "@/server/content";
import {
  changeSlug,
  getEntryDocument,
  publishDueEntries,
  saveEntry,
  transitionEntry,
} from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/secrets";
import { createSite } from "@/server/sites";
import { checkWebhookUrl, isPrivateAddress, WebhookUrlError } from "@/server/webhook-url";
import {
  createWebhook,
  deleteWebhook,
  deliverWebhooks,
  listDeliveries,
  listWebhooks,
  processWebhookQueue,
  queueTestEvent,
  resendDelivery,
  revealWebhookSecret,
  rotateWebhookSecret,
  setWebhookEnabled,
  WebhookLimitError,
} from "@/server/webhooks";
import { MAX_ATTEMPTS, MAX_WEBHOOKS, WEBHOOK_EVENT_KEYS } from "@/lib/webhooks";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-webhook-encryption-0123456789";

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

let db: Database;
let siteId: string;
let server: Server;
let baseUrl: string;
let received: Received[] = [];
/** Status the fake website answers with. */
let respondWith = 200;

async function freshEntry(title: string) {
  const { id } = await createEntry(db, "owner", siteId, "post", title);
  return id;
}
async function version(entryId: string) {
  const doc = await getEntryDocument(db, "owner", siteId, entryId);
  assert.ok(doc);
  return doc.entry.updatedAt;
}
async function publish(entryId: string) {
  await transitionEntry(db, "owner", siteId, entryId, {
    action: "publish",
    expectedUpdatedAt: await version(entryId),
  });
}
const events = async (webhookId: string) =>
  (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, webhookId)))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((row) => row.event);

async function hookFor(eventKeys: string[] = WEBHOOK_EVENT_KEYS) {
  return (await createWebhook(db, "owner", siteId, { url: `${baseUrl}/hook`, events: eventKeys }))
    .id;
}

before(async () => {
  process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1";
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(respondWith, { "Content-Type": "text/plain" });
      res.end(respondWith === 200 ? "ok" : "nope");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
  ]);
});

after(() => server.close());

beforeEach(async () => {
  received = [];
  respondWith = 200;
  await db.delete(webhooks).where(eq(webhooks.siteId, siteId));
});

describe("webhook URLs", () => {
  test("block private and non-https addresses in production", () => {
    process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "0";
    try {
      for (const url of [
        "http://example.com/hook",
        "https://localhost/hook",
        "https://127.0.0.1/hook",
        "https://169.254.169.254/latest/meta-data",
        "https://10.1.2.3/",
        "https://[::1]/",
        "https://user:pass@example.com/",
        "not a url",
      ]) {
        assert.throws(() => checkWebhookUrl(url), WebhookUrlError, url);
      }
      assert.equal(checkWebhookUrl(" https://example.com/hook#x "), "https://example.com/hook");
    } finally {
      process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1";
    }
  });

  test("classifies addresses", () => {
    assert.equal(isPrivateAddress("192.168.1.5"), true);
    assert.equal(isPrivateAddress("::ffff:10.0.0.1"), true);
    assert.equal(isPrivateAddress("fd00::1"), true);
    assert.equal(isPrivateAddress("93.184.216.34"), false);
    assert.equal(isPrivateAddress("2606:4700::1111"), false);
  });
});

describe("secrets", () => {
  test("encrypt and decrypt, and reject tampering", () => {
    const stored = encryptSecret("whsec_abc");
    assert.ok(!stored.includes("whsec_abc"));
    assert.equal(decryptSecret(stored), "whsec_abc");
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => decryptSecret(parts.join(".")));
  });
});

describe("managing webhooks", () => {
  test("owners and admins only; other sites can't touch them", async () => {
    const id = await hookFor();
    assert.equal((await listWebhooks(db, "admin", siteId)).length, 1);
    await assert.rejects(listWebhooks(db, "editor", siteId), NotAllowedError);
    await assert.rejects(revealWebhookSecret(db, "stranger", siteId, id), NotAllowedError);
    const other = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
    await assert.rejects(deleteWebhook(db, "stranger", other, id), NotAllowedError);
  });

  test("validates events and the limit", async () => {
    await assert.rejects(createWebhook(db, "owner", siteId, { url: `${baseUrl}/x`, events: [] }));
    await assert.rejects(
      createWebhook(db, "owner", siteId, { url: `${baseUrl}/x`, events: ["entry.exploded"] }),
    );
    for (let i = 0; i < MAX_WEBHOOKS; i++) await hookFor();
    await assert.rejects(hookFor(), WebhookLimitError);
  });

  test("reveals and rotates the signing secret", async () => {
    const id = await hookFor();
    const first = await revealWebhookSecret(db, "owner", siteId, id);
    assert.match(first, /^whsec_[A-Za-z0-9_-]{43}$/);
    await rotateWebhookSecret(db, "owner", siteId, id);
    assert.notEqual(await revealWebhookSecret(db, "owner", siteId, id), first);
  });
});

describe("events", () => {
  test("publish, update, URL change and unpublish are queued", async () => {
    const id = await hookFor();
    const entryId = await freshEntry("Event post");
    // Drafts don't notify anyone.
    await saveEntry(db, "owner", siteId, entryId, {
      title: "Event post",
      body: { type: "doc", content: [{ type: "paragraph" }] },
      seo: {},
      expectedUpdatedAt: await version(entryId),
    });
    assert.deepEqual(await events(id), []);

    await publish(entryId);
    await saveEntry(db, "owner", siteId, entryId, {
      title: "Event post (edited)",
      body: { type: "doc", content: [{ type: "paragraph" }] },
      seo: {},
      expectedUpdatedAt: await version(entryId),
    });
    await changeSlug(db, "owner", siteId, entryId, {
      slug: "moved",
      createRedirect: true,
      expectedUpdatedAt: await version(entryId),
    });
    await transitionEntry(db, "owner", siteId, entryId, {
      action: "unpublish",
      expectedUpdatedAt: await version(entryId),
    });
    assert.deepEqual(await events(id), [
      "entry.published",
      "entry.updated",
      "entry.slug_changed",
      "entry.unpublished",
    ]);

    const [moved] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.event, "entry.slug_changed"));
    assert.deepEqual(moved.payload.data, {
      entry: {
        id: entryId,
        type: "post",
        title: "Event post (edited)",
        slug: "moved",
        path: "/posts/moved",
        url: "https://blog.example/posts/moved",
      },
      previousPath: "/posts/event-post",
      redirectCreated: true,
    });
  });

  test("only subscribed, enabled webhooks receive an event", async () => {
    const onlyPublished = await hookFor(["entry.published"]);
    const onlyUnpublished = await hookFor(["entry.unpublished"]);
    const off = await hookFor();
    await setWebhookEnabled(db, "owner", siteId, off, false);
    await publish(await freshEntry("Subscribed"));
    assert.deepEqual(await events(onlyPublished), ["entry.published"]);
    assert.deepEqual(await events(onlyUnpublished), []);
    assert.deepEqual(await events(off), []);
  });

  test("archiving live content sends unpublished; archiving a draft sends nothing", async () => {
    const id = await hookFor(["entry.unpublished"]);
    const live = await freshEntry("Live then archived");
    await publish(live);
    const draft = await freshEntry("Draft archived");
    await applyBulkAction(db, "owner", siteId, [live, draft], "archive");
    assert.deepEqual(await events(id), ["entry.unpublished"]);
  });

  test("scheduled entries notify when they go live", async () => {
    const id = await hookFor(["entry.published"]);
    const entryId = await freshEntry("Scheduled");
    await transitionEntry(db, "owner", siteId, entryId, {
      action: "schedule",
      scheduledAt: new Date(Date.now() + 120_000).toISOString(),
      expectedUpdatedAt: await version(entryId),
    });
    assert.deepEqual(await events(id), []);
    const { contentEntries } = await import("@/server/db/schema");
    await db
      .update(contentEntries)
      .set({ scheduledAt: new Date(Date.now() - 1000) })
      .where(eq(contentEntries.id, entryId));
    await publishDueEntries(db, siteId);
    assert.deepEqual(await events(id), ["entry.published"]);
  });

  test("rapid updates are combined and spaced 30 seconds apart", async () => {
    const id = await hookFor(["entry.updated"]);
    const entryId = await freshEntry("Busy post");
    await publish(entryId);
    const edit = async (title: string) =>
      saveEntry(db, "owner", siteId, entryId, {
        title,
        body: { type: "doc", content: [{ type: "paragraph" }] },
        seo: {},
        expectedUpdatedAt: await version(entryId),
      });
    await edit("One");
    await processWebhookQueue(db);
    await edit("Two");
    await edit("Three");
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, id));
    assert.equal(rows.length, 2);
    const waiting = rows.find((row) => row.status === "pending");
    assert.ok(waiting);
    assert.equal((waiting.payload.data as { entry: { title: string } }).entry.title, "Three");
    const first = rows.find((row) => row.status === "succeeded");
    assert.ok(first);
    assert.equal(waiting.nextAttemptAt.getTime(), first.createdAt.getTime() + 30_000);
  });
});

describe("delivery", () => {
  test("sends signed JSON that the website can verify", async () => {
    const id = await hookFor(["entry.published"]);
    const secret = await revealWebhookSecret(db, "owner", siteId, id);
    await publish(await freshEntry("Signed"));
    assert.deepEqual(await processWebhookQueue(db), { sent: 1, failed: 0 });

    assert.equal(received.length, 1);
    const [{ headers, body }] = received;
    assert.equal(headers["klipt-event"], "entry.published");
    const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(headers["klipt-signature"]));
    assert.ok(match);
    const expected = createHmac("sha256", secret).update(`${match[1]}.${body}`).digest("hex");
    assert.equal(match[2], expected);
    const json = JSON.parse(body);
    assert.equal(json.event, "entry.published");
    assert.equal(json.id, headers["klipt-delivery"]);
    assert.equal(json.data.entry.title, "Signed");
    assert.equal(json.site.name, "Blog");

    const [log] = await listDeliveries(db, "owner", siteId, id);
    assert.equal(log.status, "succeeded");
    assert.equal(log.responseStatus, 200);
    assert.equal(log.responseBody, "ok");
  });

  test("retries with backoff, then gives up", async () => {
    respondWith = 500;
    const id = await hookFor(["entry.published"]);
    await publish(await freshEntry("Flaky"));
    let now = new Date();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await processWebhookQueue(db, { now });
      assert.equal(result.failed, 1, `attempt ${attempt}`);
      const [row] = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, id));
      assert.equal(row.attempts, attempt);
      assert.equal(row.status, attempt === MAX_ATTEMPTS ? "failed" : "pending");
      assert.equal(row.error, "Your website responded with 500.");
      // Not due again until the backoff has passed.
      assert.deepEqual(await processWebhookQueue(db, { now }), { sent: 0, failed: 0 });
      now = new Date(row.nextAttemptAt.getTime() + 1);
    }
    assert.equal(received.length, MAX_ATTEMPTS);
  });

  test("a concurrent run never sends the same delivery twice", async () => {
    await hookFor(["entry.published"]);
    await publish(await freshEntry("Once"));
    await Promise.all([processWebhookQueue(db), processWebhookQueue(db), processWebhookQueue(db)]);
    assert.equal(received.length, 1);
  });

  test("records connection failures", async () => {
    const { id } = await createWebhook(db, "owner", siteId, {
      url: "http://127.0.0.1:1/closed",
      events: ["entry.published"],
    });
    await publish(await freshEntry("Unreachable"));
    await processWebhookQueue(db);
    const [log] = await listDeliveries(db, "owner", siteId, id);
    assert.equal(log.status, "pending");
    assert.match(log.error ?? "", /^Couldn't connect to your website/);
  });

  test("test events and resends", async () => {
    const id = await hookFor();
    const pingId = await queueTestEvent(db, "owner", siteId, id);
    await processWebhookQueue(db, { deliveryIds: [pingId] });
    assert.equal(JSON.parse(received[0].body).event, "ping");

    const again = await resendDelivery(db, "owner", siteId, pingId);
    assert.notEqual(again, pingId);
    await deliverWebhooks(db, { siteId });
    assert.equal(received.length, 2);
    assert.equal(JSON.parse(received[1].body).id, again);
    await assert.rejects(resendDelivery(db, "editor", siteId, pingId), NotAllowedError);
  });

  test("deliveries for a turned-off webhook are not sent", async () => {
    const id = await hookFor(["entry.published"]);
    await publish(await freshEntry("Turned off"));
    await setWebhookEnabled(db, "owner", siteId, id, false);
    await processWebhookQueue(db);
    assert.equal(received.length, 0);
    const [log] = await listDeliveries(db, "owner", siteId, id);
    assert.equal(log.status, "failed");
    assert.equal(log.error, "Webhook is turned off.");
  });
});
