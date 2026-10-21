import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { auditEvents, contentEntries, siteMembers, users } from "@/server/db/schema";
import { deleteAccount } from "@/server/account";
import {
  EDIT_ACTIVITY_WINDOW_MS,
  listActivity,
  pruneActivity,
  recordActivity,
  recordEntryEdit,
} from "@/server/activity";
import { createApiKey } from "@/server/api-keys";
import { applyBulkAction, createEntry } from "@/server/content";
import { getEntryDocument, saveEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { createSite } from "@/server/sites";
import { changeMemberRole } from "@/server/team";
import {
  describeActivity,
  kindOf,
  parseActivityParams,
  visibleKinds,
  type ActivityParams,
} from "@/lib/activity";

let db: Database;
let siteId: string;

const params = (overrides: Partial<ActivityParams> = {}): ActivityParams => ({
  ...parseActivityParams({}),
  ...overrides,
});

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "author", "viewer", "leaver"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Journal", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
    { siteId, userId: "leaver", role: "editor" },
  ]);
});

describe("activity vocabulary (client-safe)", () => {
  test("kinds and who sees them", () => {
    assert.equal(kindOf("content.published"), "content");
    assert.equal(kindOf("term.created"), "structure");
    assert.equal(kindOf("member.invited"), "team");
    assert.equal(kindOf("redirect.created"), "settings");
    assert.equal(kindOf("webhook.deleted"), "integrations");
    assert.equal(visibleKinds("admin").length, 6);
    assert.deepEqual(visibleKinds("editor"), ["content", "media", "structure"]);
    assert.deepEqual(visibleKinds("author"), []);
    assert.deepEqual(visibleKinds("viewer"), []);
  });

  test("sentences", () => {
    assert.deepEqual(describeActivity("content.published", { title: "Hello" }), {
      verb: "published",
      target: "Hello",
      detail: null,
    });
    assert.equal(
      describeActivity("content.published", { title: "Hello", from: "in_review" }).verb,
      "approved and published",
    );
    assert.equal(
      describeActivity("content.assigned", { title: "A", assigneeName: "Sam" }).detail,
      "to Sam",
    );
    assert.equal(
      describeActivity("content.assigned", { title: "A", assigneeId: "x", actorId: "x" }).verb,
      "took on",
    );
    assert.equal(
      describeActivity("member.role_changed", { name: "Ann", to: "editor" }).detail,
      "to Editor",
    );
    assert.match(describeActivity("something.new", {}).verb, /something new/);
  });

  test("URL filters fall back to none", () => {
    assert.deepEqual(parseActivityParams({ kind: "nope", from: "yesterday", page: "-1" }), {
      person: "",
      kind: "",
      from: "",
      to: "",
      page: 1,
    });
    assert.equal(parseActivityParams({ kind: "team", from: "2026-01-31" }).from, "2026-01-31");
  });
});

describe("recording", () => {
  test("autosave records one edit per person and entry per window", async () => {
    const entry = await createEntry(db, "editor", siteId, "post");
    let doc = await getEntryDocument(db, "editor", siteId, entry.id);
    assert.ok(doc);
    for (const title of ["One", "Two", "Three"]) {
      const state = await saveEntry(db, "editor", siteId, entry.id, {
        title,
        body: doc.body,
        seo: {},
        expectedUpdatedAt: doc.entry.updatedAt,
      });
      doc = { ...doc, entry: { ...doc.entry, updatedAt: state.updatedAt } };
    }
    const rows = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.targetId, entry.id));
    // "created" covers the first window, so autosaves right after creating add nothing.
    assert.deepEqual(
      rows.map((row) => row.action),
      ["content.created"],
    );
    const later = new Date(Date.now() + EDIT_ACTIVITY_WINDOW_MS + 1000);
    assert.equal(
      await recordEntryEdit(db, siteId, "editor", { id: entry.id, title: "Three" }, later),
      true,
    );
    assert.equal(
      await recordEntryEdit(db, siteId, "author", { id: entry.id, title: "Three" }),
      true,
    );
  });
});

describe("listActivity", () => {
  test("owners see everything; editors only content, media and structure", async () => {
    await createApiKey(db, "owner", siteId, "Website");
    const ownerFeed = await listActivity(db, "owner", siteId, params());
    assert.ok(ownerFeed.items.some((item) => item.action === "api_key.created"));
    assert.ok(ownerFeed.items.some((item) => item.action === "site.created"));
    const editorFeed = await listActivity(db, "editor", siteId, params());
    assert.ok(editorFeed.items.length > 0);
    assert.ok(
      editorFeed.items.every((item) => ["content", "media", "structure"].includes(item.kind)),
    );
    const asked = await listActivity(db, "editor", siteId, params({ kind: "integrations" }));
    assert.equal(asked.items.length, 0, "a kind the role can't see returns nothing");

    await assert.rejects(listActivity(db, "author", siteId, params()), NotAllowedError);
    await assert.rejects(listActivity(db, "viewer", siteId, params()), NotAllowedError);
  });

  test("filters by person, kind and day; links targets that still exist", async () => {
    const entry = await createEntry(db, "admin", siteId, "page");
    const mine = await listActivity(db, "owner", siteId, params({ person: "admin" }));
    assert.ok(mine.items.length > 0);
    assert.ok(mine.items.every((item) => item.actorId === "admin"));
    const created = mine.items.find((item) => item.action === "content.created");
    assert.equal(created?.href, `/sites/${siteId}/content/${entry.id}`);
    assert.equal(created?.actorName, "User admin");
    assert.equal(created?.verb, "created");

    const team = await listActivity(db, "owner", siteId, params({ kind: "team" }));
    assert.ok(team.items.every((item) => item.kind === "team"));

    const today = new Date().toISOString().slice(0, 10);
    assert.ok((await listActivity(db, "owner", siteId, params({ from: today }))).items.length > 0);
    assert.equal(
      (await listActivity(db, "owner", siteId, params({ to: "2020-01-01" }))).items.length,
      0,
    );

    // Deleted targets keep their row but lose the link.
    await db
      .update(contentEntries)
      .set({ status: "archived" })
      .where(eq(contentEntries.id, entry.id));
    await applyBulkAction(db, "owner", siteId, [entry.id], "delete");
    const after = await listActivity(db, "owner", siteId, params({ person: "admin" }));
    assert.equal(after.items.find((item) => item.action === "content.created")?.href, null);
  });

  test("pages through older activity", async () => {
    for (let i = 0; i < 5; i++) {
      await recordActivity(db, {
        siteId,
        actorId: "owner",
        action: "seo.defaults_changed",
        targetType: "site",
        targetId: siteId,
      });
    }
    const first = await listActivity(db, "owner", siteId, params(), { pageSize: 3 });
    assert.equal(first.items.length, 3);
    assert.equal(first.hasMore, true);
    const second = await listActivity(db, "owner", siteId, params({ page: 2 }), { pageSize: 3 });
    assert.equal(second.items.length, 3);
    assert.notEqual(second.items[0].id, first.items[0].id);
  });

  test("a deleted account's name stays on its activity", async () => {
    await recordActivity(db, {
      siteId,
      actorId: "leaver",
      action: "content.created",
      targetType: "content_entry",
      targetId: "gone",
      metadata: { title: "Old post" },
    });
    await changeMemberRole(db, "owner", siteId, "leaver", "author");
    await deleteAccount(db, "leaver", "leaver@test.local");
    const feed = await listActivity(db, "owner", siteId, params());
    const row = feed.items.find((item) => item.target === "Old post");
    assert.equal(row?.actorName, "User leaver");
    assert.equal(row?.actorActive, false);
    assert.equal(row?.actorId, null);
  });

  test("activity older than a year is pruned", async () => {
    const old = new Date(Date.now() - 400 * 86_400_000);
    await db.insert(auditEvents).values({
      siteId,
      actorId: "owner",
      action: "site.updated",
      createdAt: old,
    });
    assert.ok((await pruneActivity(db)) >= 1);
    const rows = await db.select({ createdAt: auditEvents.createdAt }).from(auditEvents);
    assert.ok(rows.every((row) => row.createdAt > old));
  });
});
