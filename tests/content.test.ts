import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { auditEvents, contentEntries, siteMembers, users } from "@/server/db/schema";
import {
  applyBulkAction,
  createEntry,
  getEntry,
  listEntries,
  NotAllowedError,
} from "@/server/content";
import { createSite } from "@/server/sites";
import {
  entryActions,
  parseContentListParams,
  slugify,
  type ContentListParams,
} from "@/lib/content";

let db: Database;
let siteId: string;
let otherSiteId: string;

const params = (overrides: Partial<ContentListParams> = {}): ContentListParams => ({
  q: "",
  status: "active",
  sort: "updated_desc",
  page: 1,
  term: "",
  assignee: "",
  ...overrides,
});

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "editor", "author", "viewer", "outsider"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Site", domain: null })).id;
  otherSiteId = (await createSite(db, "outsider", { name: "Other", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

describe("slugify", () => {
  test("makes readable URL slugs", () => {
    assert.equal(slugify("Hello, Wörld! Café & Bar"), "hello-world-cafe-and-bar");
    assert.equal(slugify("  --  "), "untitled");
  });
});

describe("list parameters", () => {
  test("fall back to defaults for invalid values", () => {
    assert.deepEqual(parseContentListParams({ status: "nope", sort: "x", page: "-3" }), params());
    assert.equal(parseContentListParams({ status: "archived", page: "2" }).page, 2);
  });
});

describe("createEntry", () => {
  test("creates drafts with unique slugs and an audit event", async () => {
    const a = await createEntry(db, "author", siteId, "post");
    const b = await createEntry(db, "author", siteId, "post");
    const [first, second] = await Promise.all([
      getEntry(db, "author", siteId, a.id),
      getEntry(db, "author", siteId, b.id),
    ]);
    assert.equal(first?.slug, "untitled-post");
    assert.equal(second?.slug, "untitled-post-2");
    assert.equal(first?.status, "draft");
    assert.equal(first?.authorId, "author");
    const events = await db.select().from(auditEvents).where(eq(auditEvents.targetId, a.id));
    assert.deepEqual(
      events.map((e) => e.action),
      ["content.created"],
    );
  });

  test("the same slug is allowed in a different content type", async () => {
    const page = await createEntry(db, "owner", siteId, "page", "Untitled post");
    assert.equal((await getEntry(db, "owner", siteId, page.id))?.slug, "untitled-post");
  });

  test("viewers and non-members can't create", async () => {
    await assert.rejects(createEntry(db, "viewer", siteId, "page"), NotAllowedError);
    await assert.rejects(createEntry(db, "outsider", siteId, "page"), NotAllowedError);
  });
});

describe("listEntries", () => {
  test("filters by type, status and search, with counts", async () => {
    const site = (await createSite(db, "owner", { name: "List", domain: null })).id;
    for (const title of ["Alpha page", "Beta page"])
      await createEntry(db, "owner", site, "page", title);
    for (const title of ["Gamma post", "Delta post", "Alpha post"])
      await createEntry(db, "owner", site, "post", title);
    const [archived] = (await listEntries(db, "owner", site, "post", params({ q: "delta" }))).items;
    await applyBulkAction(db, "owner", site, [archived.id], "archive");

    const all = await listEntries(db, "owner", site, "all", params());
    assert.equal(all.total, 4, "archived entries are hidden by default");
    assert.equal(all.counts.archived, 1);

    const posts = await listEntries(db, "owner", site, "post", params({ sort: "title_asc" }));
    assert.deepEqual(
      posts.items.map((e) => e.title),
      ["Alpha post", "Gamma post"],
    );

    const search = await listEntries(db, "owner", site, "all", params({ q: "alpha" }));
    assert.deepEqual(search.items.map((e) => e.title).sort(), ["Alpha page", "Alpha post"]);

    const onlyArchived = await listEntries(
      db,
      "owner",
      site,
      "all",
      params({ status: "archived" }),
    );
    assert.deepEqual(
      onlyArchived.items.map((e) => e.title),
      ["Delta post"],
    );

    const literal = await listEntries(db, "owner", site, "all", params({ q: "100%" }));
    assert.equal(literal.total, 0, "LIKE wildcards in search are escaped");
  });

  test("clamps the page to the last page", async () => {
    const list = await listEntries(db, "owner", siteId, "all", params({ page: 99 }));
    assert.equal(list.page, list.pageCount);
  });

  test("non-members can't list or read entries", async () => {
    const { id } = await createEntry(db, "owner", siteId, "page", "Private");
    await assert.rejects(listEntries(db, "outsider", siteId, "all", params()), NotAllowedError);
    await assert.rejects(getEntry(db, "outsider", siteId, id), NotAllowedError);
    // An entry id from another site is not found within this one.
    assert.equal(await getEntry(db, "outsider", otherSiteId, id), null);
  });
});

describe("entry policy and bulk actions", () => {
  test("policy: authors manage only their own never-published entries", () => {
    const own = { status: "draft" as const, authorId: "author", publishedAt: null };
    assert.deepEqual(entryActions("author", "author", own), {
      archive: true,
      restore: false,
      delete: false,
    });
    assert.equal(
      entryActions("author", "author", { ...own, publishedAt: new Date() }).archive,
      false,
    );
    assert.equal(entryActions("author", "author", { ...own, authorId: "owner" }).archive, false);
    assert.equal(entryActions("editor", "editor", { ...own, authorId: "owner" }).archive, true);
    assert.equal(entryActions("viewer", "viewer", own).archive, false);
    assert.equal(entryActions("owner", "owner", { ...own, status: "archived" }).delete, true);
  });

  test("bulk actions skip entries the member may not change", async () => {
    const mine = await createEntry(db, "author", siteId, "post", "Author draft");
    const theirs = await createEntry(db, "owner", siteId, "post", "Owner draft");

    const result = await applyBulkAction(db, "author", siteId, [mine.id, theirs.id], "archive");
    assert.deepEqual(result, { applied: 1, skipped: 1 });
    assert.equal((await getEntry(db, "owner", siteId, mine.id))?.status, "archived");
    assert.equal((await getEntry(db, "owner", siteId, theirs.id))?.status, "draft");

    assert.deepEqual(await applyBulkAction(db, "viewer", siteId, [theirs.id], "archive"), {
      applied: 0,
      skipped: 1,
    });
  });

  test("delete only removes archived entries; restore returns them to draft", async () => {
    const { id } = await createEntry(db, "editor", siteId, "page", "Temporary");
    assert.deepEqual(await applyBulkAction(db, "editor", siteId, [id], "delete"), {
      applied: 0,
      skipped: 1,
    });
    await applyBulkAction(db, "editor", siteId, [id], "archive");
    await applyBulkAction(db, "editor", siteId, [id], "restore");
    assert.equal((await getEntry(db, "editor", siteId, id))?.status, "draft");
    await applyBulkAction(db, "editor", siteId, [id], "archive");
    assert.deepEqual(await applyBulkAction(db, "editor", siteId, [id], "delete"), {
      applied: 1,
      skipped: 0,
    });
    assert.equal(await getEntry(db, "editor", siteId, id), null);
    const actions = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.targetId, id)));
    assert.deepEqual(
      actions.map((a) => a.action),
      [
        "content.created",
        "content.archived",
        "content.restored",
        "content.archived",
        "content.deleted",
      ],
    );
  });

  test("bulk actions can't reach entries of another site", async () => {
    const foreign = await createEntry(db, "outsider", otherSiteId, "page", "Foreign");
    assert.deepEqual(await applyBulkAction(db, "owner", siteId, [foreign.id], "archive"), {
      applied: 0,
      skipped: 1,
    });
    const [row] = await db
      .select({ status: contentEntries.status })
      .from(contentEntries)
      .where(eq(contentEntries.id, foreign.id));
    assert.equal(row.status, "draft");
  });
});
