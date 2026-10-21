import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import {
  contentEntries,
  contentRevisions,
  redirects,
  siteMembers,
  users,
} from "@/server/db/schema";
import { applyBulkAction, createEntry } from "@/server/content";
import {
  ConflictError,
  EditorValidationError,
  changeSlug,
  getEntryDocument,
  publishDueEntries,
  saveEntry,
  transitionEntry,
} from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { createSite } from "@/server/sites";
import { canEditEntry, workflowActions } from "@/lib/content";
import { isSafeHref, sanitizeDoc, wordCount } from "@/lib/editor/rich-text";
import { entryPath, resolveSeo } from "@/lib/seo";

let db: Database;
let siteId: string;

async function doc(entryId: string, userId = "owner") {
  const d = await getEntryDocument(db, userId, siteId, entryId);
  assert.ok(d);
  return d;
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "editor", "author", "viewer"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Site", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

describe("rich text sanitizer", () => {
  test("keeps allowed structure and drops unsafe links and unknown nodes", () => {
    const clean = sanitizeDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hi" }] },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            {
              type: "text",
              text: "good",
              marks: [
                { type: "link", attrs: { href: "https://example.com", onclick: "x" } },
                { type: "bold" },
                { type: "script" },
              ],
            },
          ],
        },
        {
          type: "iframe",
          content: [{ type: "paragraph", content: [{ type: "text", text: "kept" }] }],
        },
      ],
    });
    assert.deepEqual(clean.content?.[0].attrs, { level: 2 }, "H1 becomes H2 (title is the H1)");
    const [bad, good] = clean.content?.[1].content ?? [];
    assert.equal(bad.marks, undefined);
    assert.deepEqual(good.marks, [
      { type: "link", attrs: { href: "https://example.com" } },
      { type: "bold" },
    ]);
    assert.equal(clean.content?.[2].type, "paragraph", "unknown wrapper is unwrapped");
    assert.equal(wordCount(clean), 3, "adjacent text nodes form one word");
  });

  test("rejects non-documents and oversized input", () => {
    assert.throws(() => sanitizeDoc({ type: "paragraph" }));
    const huge = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(200_001) }] }],
    };
    assert.throws(() => sanitizeDoc(huge));
  });

  test("link safety", () => {
    for (const ok of ["https://a.com", "mailto:a@b.co", "/about", "#top"])
      assert.equal(isSafeHref(ok), true, ok);
    for (const bad of ["javascript:x", "//evil.com", "data:text/html,x", " vbscript:x"])
      assert.equal(isSafeHref(bad), false, bad);
  });
});

describe("SEO helpers", () => {
  test("defaults and paths", () => {
    const seo = resolveSeo({ index: false }, "Title");
    assert.equal(seo.title, "Title");
    assert.equal(seo.includeInSitemap, false, "noindex pages leave the sitemap");
    assert.equal(entryPath("page", "about"), "/about");
    assert.equal(entryPath("post", "hello"), "/posts/hello");
  });
});

describe("editing policy", () => {
  const draft = { status: "draft" as const, authorId: "author", publishedAt: null };
  test("authors edit only their own drafts; archived is read-only", () => {
    assert.equal(canEditEntry("author", "author", draft), true);
    assert.equal(canEditEntry("author", "author", { ...draft, status: "published" }), false);
    assert.equal(canEditEntry("author", "author", { ...draft, authorId: "x" }), false);
    assert.equal(canEditEntry("editor", "editor", { ...draft, status: "published" }), true);
    assert.equal(canEditEntry("owner", "owner", { ...draft, status: "archived" }), false);
    assert.equal(canEditEntry("viewer", "viewer", draft), false);
  });
  test("authors submit for review; editors publish", () => {
    assert.deepEqual(workflowActions("author", "author", draft), {
      publish: false,
      schedule: false,
      unpublish: false,
      submit: true,
      withdraw: false,
      request_changes: false,
    });
    assert.equal(workflowActions("editor", "editor", draft).publish, true);
    assert.equal(workflowActions("editor", "editor", draft).submit, false);
  });
});

describe("saveEntry", () => {
  test("saves sanitized content and detects conflicting edits", async () => {
    const { id } = await createEntry(db, "author", siteId, "post", "Draft");
    const before = await doc(id);
    const saved = await saveEntry(db, "author", siteId, id, {
      title: "Hello world",
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }],
      },
      seo: { title: "SEO title", description: "Desc" },
      expectedUpdatedAt: before.entry.updatedAt,
    });
    const after = await doc(id);
    assert.equal(after.entry.title, "Hello world");
    assert.equal(after.seo.title, "SEO title");
    assert.equal(after.entry.updatedAt, saved.updatedAt);

    await assert.rejects(
      saveEntry(db, "author", siteId, id, {
        title: "Stale",
        body: after.body,
        seo: {},
        expectedUpdatedAt: before.entry.updatedAt,
      }),
      ConflictError,
    );
  });

  test("rejects invalid SEO and people who can't edit", async () => {
    const { id } = await createEntry(db, "owner", siteId, "page", "Owner page");
    const d = await doc(id);
    await assert.rejects(
      saveEntry(db, "owner", siteId, id, {
        title: "x",
        body: d.body,
        seo: { canonicalUrl: "not a url" },
        expectedUpdatedAt: d.entry.updatedAt,
      }),
      EditorValidationError,
    );
    for (const userId of ["author", "viewer"]) {
      await assert.rejects(
        saveEntry(db, userId, siteId, id, {
          title: "x",
          body: d.body,
          seo: {},
          expectedUpdatedAt: d.entry.updatedAt,
        }),
        NotAllowedError,
      );
    }
  });
});

describe("changeSlug", () => {
  test("unpublished entries change URL without a redirect", async () => {
    const { id } = await createEntry(db, "owner", siteId, "page", "Fresh");
    const d = await doc(id);
    const result = await changeSlug(db, "owner", siteId, id, {
      slug: "Brand-New",
      createRedirect: true,
      expectedUpdatedAt: d.entry.updatedAt,
    });
    assert.equal(result.slug, "brand-new");
    assert.equal(result.redirectCreated, false);
  });

  test("published entries get a 301, without chains or loops", async () => {
    const { id } = await createEntry(db, "owner", siteId, "page", "Pricing");
    let d = await doc(id);
    await transitionEntry(db, "owner", siteId, id, {
      action: "publish",
      expectedUpdatedAt: d.entry.updatedAt,
    });

    d = await doc(id);
    await changeSlug(db, "owner", siteId, id, {
      slug: "plans",
      createRedirect: true,
      expectedUpdatedAt: d.entry.updatedAt,
    });
    d = await doc(id);
    await changeSlug(db, "owner", siteId, id, {
      slug: "plans-and-pricing",
      createRedirect: true,
      expectedUpdatedAt: d.entry.updatedAt,
    });

    const rows = () =>
      db
        .select({ from: redirects.fromPath, to: redirects.toPath })
        .from(redirects)
        .where(eq(redirects.entryId, id));
    assert.deepEqual(
      (await rows()).sort((a, b) => a.from.localeCompare(b.from)),
      [
        { from: "/plans", to: "/plans-and-pricing" },
        { from: "/pricing", to: "/plans-and-pricing" },
      ],
      "the old redirect is re-pointed, not chained",
    );

    d = await doc(id);
    await changeSlug(db, "owner", siteId, id, {
      slug: "pricing",
      createRedirect: true,
      expectedUpdatedAt: d.entry.updatedAt,
    });
    const final = await rows();
    assert.ok(!final.some((r) => r.from === "/pricing"), "the live URL never redirects away");
    assert.ok(final.every((r) => r.to === "/pricing"));
  });

  test("slugs must be valid and unique within the content type", async () => {
    const a = await createEntry(db, "owner", siteId, "post", "Taken");
    const b = await createEntry(db, "owner", siteId, "post", "Other");
    const d = await doc(b.id);
    await assert.rejects(
      changeSlug(db, "owner", siteId, b.id, {
        slug: "taken",
        createRedirect: false,
        expectedUpdatedAt: d.entry.updatedAt,
      }),
      /already uses \/posts\/taken/,
    );
    await assert.rejects(
      changeSlug(db, "owner", siteId, b.id, {
        slug: "Not valid!",
        createRedirect: false,
        expectedUpdatedAt: d.entry.updatedAt,
      }),
      EditorValidationError,
    );
    assert.ok(a.id);
  });
});

describe("workflow", () => {
  test("author submits, editor publishes with a revision, then unpublishes", async () => {
    const { id } = await createEntry(db, "author", siteId, "post", "Review me");
    let d = await doc(id);
    await assert.rejects(
      transitionEntry(db, "author", siteId, id, {
        action: "publish",
        expectedUpdatedAt: d.entry.updatedAt,
      }),
      NotAllowedError,
    );
    await transitionEntry(db, "author", siteId, id, {
      action: "submit",
      expectedUpdatedAt: d.entry.updatedAt,
    });
    d = await doc(id);
    assert.equal(d.entry.status, "in_review");

    const published = await transitionEntry(db, "editor", siteId, id, {
      action: "publish",
      expectedUpdatedAt: d.entry.updatedAt,
    });
    assert.equal(published.status, "published");
    assert.ok(published.publishedAt);
    const revisions = await db
      .select()
      .from(contentRevisions)
      .where(eq(contentRevisions.entryId, id));
    assert.equal(revisions.length, 1);

    const unpublished = await transitionEntry(db, "editor", siteId, id, {
      action: "unpublish",
      expectedUpdatedAt: published.updatedAt,
    });
    assert.equal(unpublished.status, "draft");
    assert.equal(unpublished.publishedAt, published.publishedAt, "first-published date is kept");
  });

  test("scheduling needs a future time and publishes when due", async () => {
    const { id } = await createEntry(db, "owner", siteId, "post", "Later");
    const d = await doc(id);
    await assert.rejects(
      transitionEntry(db, "owner", siteId, id, {
        action: "schedule",
        scheduledAt: new Date(Date.now() - 1000).toISOString(),
        expectedUpdatedAt: d.entry.updatedAt,
      }),
      EditorValidationError,
    );
    const scheduled = await transitionEntry(db, "owner", siteId, id, {
      action: "schedule",
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      expectedUpdatedAt: d.entry.updatedAt,
    });
    assert.equal(scheduled.status, "scheduled");

    // Simulate the time passing.
    await db
      .update(contentEntries)
      .set({ scheduledAt: new Date(Date.now() - 1000) })
      .where(and(eq(contentEntries.id, id)));
    await publishDueEntries(db, siteId);
    const after = await doc(id);
    assert.equal(after.entry.status, "published");
    assert.ok(after.entry.publishedAt);
  });

  test("archived entries can't be edited or published", async () => {
    const { id } = await createEntry(db, "owner", siteId, "page", "Gone");
    await applyBulkAction(db, "owner", siteId, [id], "archive");
    const d = await doc(id);
    await assert.rejects(
      transitionEntry(db, "owner", siteId, id, {
        action: "publish",
        expectedUpdatedAt: d.entry.updatedAt,
      }),
      NotAllowedError,
    );
  });
});
