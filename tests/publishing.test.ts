import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import {
  auditEvents,
  contentEntries,
  redirects,
  siteMembers,
  users,
  webhookDeliveries,
  webhooks,
} from "@/server/db/schema";
import { createEntry } from "@/server/content";
import { getDeliverySite, listSitemap, resolvePath } from "@/server/delivery";
import { changeSlug, getEntryDocument, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { createModel } from "@/server/models";
import {
  getDefaultModelKey,
  getPublishingSettings,
  previewUrlPatterns,
  PublishingValidationError,
  savePublishingRules,
  saveUrlPatterns,
} from "@/server/publishing";
import { createSite } from "@/server/sites";
import { createTaxonomy } from "@/server/taxonomy";
import { workflowActions } from "@/lib/content";
import {
  buildPath,
  DEFAULT_PATH_RULES,
  entryPath,
  matchPath,
  parsePattern,
  patternsOverlap,
  validatePatterns,
} from "@/lib/url-patterns";

let db: Database;
let siteId: string;

async function publishedPost(slug: string, publishedAt = new Date("2025-03-14T12:00:00Z")) {
  const { id } = await createEntry(db, "owner", siteId, "post");
  await db
    .update(contentEntries)
    .set({ title: slug, slug, status: "published", publishedAt })
    .where(eq(contentEntries.id, id));
  return id;
}

async function draftPost(title: string, authorId = "editor") {
  const { id } = await createEntry(db, authorId, siteId, "post");
  await db.update(contentEntries).set({ title }).where(eq(contentEntries.id, id));
  return id;
}

async function version(entryId: string) {
  const [row] = await db
    .select({ updatedAt: contentEntries.updatedAt })
    .from(contentEntries)
    .where(eq(contentEntries.id, entryId));
  return row.updatedAt.toISOString();
}

async function redirectMap() {
  const rows = await db
    .select({ from: redirects.fromPath, to: redirects.toPath })
    .from(redirects)
    .where(eq(redirects.siteId, siteId));
  return Object.fromEntries(rows.map((row) => [row.from, row.to]));
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "editor2", "author"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Journal", domain: "journal.test" })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "editor2", role: "editor" },
    { siteId, userId: "author", role: "author" },
  ]);
});

describe("URL patterns (client-safe)", () => {
  test("patterns must end with {slug} and use known placeholders", () => {
    assert.ok("segments" in parsePattern("/blog/{yyyy}/{mm}/{slug}"));
    assert.ok("segments" in parsePattern("/{slug}"));
    for (const bad of [
      "blog/{slug}",
      "/blog/{slug}/",
      "/blog//{slug}",
      "/blog",
      "/{slug}/x",
      "/{day}/{slug}",
      "/{slug}/{slug}",
      "/Blog/{slug}",
      "/blog-{slug}",
      "/{mm}/{yyyy}/{slug}",
      "/api/{slug}",
    ]) {
      assert.ok("error" in parsePattern(bad), bad);
    }
  });

  test("builds paths with dates in the site's time zone", () => {
    const date = new Date("2025-12-31T23:30:00Z");
    assert.equal(buildPath("/blog/{yyyy}/{mm}/{slug}", "x", date, "UTC"), "/blog/2025/12/x");
    assert.equal(
      buildPath("/blog/{yyyy}/{mm}/{slug}", "x", date, "Africa/Lagos"),
      "/blog/2026/01/x",
    );
    assert.equal(entryPath(DEFAULT_PATH_RULES, "page", "about"), "/about");
    assert.equal(entryPath(DEFAULT_PATH_RULES, "post", "hello"), "/posts/hello");
    assert.equal(entryPath(DEFAULT_PATH_RULES, "product", "mug"), "/product/mug");
    assert.equal(
      entryPath({ patterns: { post: "/blog/{slug}" }, timeZone: "UTC" }, "post", "hello"),
      "/blog/hello",
    );
  });

  test("overlapping patterns are refused", () => {
    assert.equal(patternsOverlap("/{slug}", "/posts/{slug}"), false);
    assert.equal(patternsOverlap("/{slug}", "/{slug}"), true);
    assert.equal(patternsOverlap("/blog/{slug}", "/{yyyy}/{slug}"), false);
    assert.equal(patternsOverlap("/{slug}/{slug2}", "/x/{slug}"), false);
    assert.equal(patternsOverlap("/news/{slug}", "/{slug}/{slug}"), false);
    assert.equal(patternsOverlap("/{yyyy}/{slug}", "/{mm}/{slug}"), false);
    assert.equal(patternsOverlap("/{yyyy}/{slug}", "/2024/{slug}"), true);
    const errors = validatePatterns(
      [
        { key: "page", label: "Pages", pattern: "/{slug}" },
        { key: "post", label: "Posts", pattern: "/{slug}" },
      ],
      [],
    );
    assert.ok(errors.page && errors.post);
    const archive = validatePatterns(
      [{ key: "post", label: "Posts", pattern: "/tag/{slug}" }],
      [{ key: "taxonomy:tag", label: "Tags pages", pattern: "/tag/{slug}" }],
    );
    assert.match(archive.post, /Tags pages/);
  });

  test("matches paths back to content types", () => {
    const rules = { patterns: { post: "/blog/{yyyy}/{slug}" }, timeZone: "UTC" };
    assert.deepEqual(matchPath(rules, ["page", "post"], "/blog/2025/hello"), [
      { modelKey: "post", slug: "hello" },
    ]);
    assert.deepEqual(matchPath(rules, ["page", "post"], "/about"), [
      { modelKey: "page", slug: "about" },
    ]);
    assert.deepEqual(matchPath(rules, ["page", "post"], "/blog/20x5/hello"), []);
  });
});

describe("saving URL patterns", () => {
  test("only owners and admins change them, and bad patterns are refused", async () => {
    await assert.rejects(
      saveUrlPatterns(db, "editor", siteId, { patterns: { post: "/blog/{slug}" } }),
      NotAllowedError,
    );
    await assert.rejects(
      saveUrlPatterns(db, "owner", siteId, { patterns: { post: "/{slug}" } }),
      (error: unknown) => error instanceof PublishingValidationError && Boolean(error.errors.post),
    );
    await assert.rejects(
      saveUrlPatterns(db, "owner", siteId, { patterns: { post: "/category/{slug}" } }),
      PublishingValidationError,
    );
  });

  test("moving posts adds one-hop redirects, re-points old ones, and queues webhooks", async () => {
    const hello = await publishedPost("hello");
    await publishedPost("second");
    await draftPost("Unpublished");
    // An older redirect to the post's current address must follow it.
    await db.insert(redirects).values({ siteId, fromPath: "/old-hello", toPath: "/posts/hello" });
    await db.insert(webhooks).values({
      siteId,
      url: "https://hooks.test/klipt",
      events: ["entry.slug_changed"],
      secretEncrypted: "x",
    });

    const preview = await previewUrlPatterns(db, "admin", siteId, {
      patterns: { post: "/blog/{yyyy}/{slug}" },
    });
    assert.equal(preview.length, 1);
    assert.equal(preview[0].moving, 2);
    assert.deepEqual(preview[0].example, { from: "/posts/hello", to: "/blog/2025/hello" });
    assert.deepEqual(
      await redirectMap(),
      { "/old-hello": "/posts/hello" },
      "preview changes nothing",
    );

    const saved = await saveUrlPatterns(db, "admin", siteId, {
      patterns: { page: "/{slug}", post: "/blog/{yyyy}/{slug}" },
    });
    assert.equal(saved.redirects, 2);
    assert.deepEqual(await redirectMap(), {
      "/old-hello": "/blog/2025/hello",
      "/posts/hello": "/blog/2025/hello",
      "/posts/second": "/blog/2025/second",
    });

    const queued = await db
      .select({ event: webhookDeliveries.event, payload: webhookDeliveries.payload })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.entryId, hello));
    assert.equal(queued.length, 1);
    const data = (queued[0].payload as { data: { entry: { path: string }; previousPath: string } })
      .data;
    assert.equal(data.entry.path, "/blog/2025/hello");
    assert.equal(data.previousPath, "/posts/hello");

    const [logged] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.siteId, siteId),
          eq(auditEvents.action, "publishing.url_patterns_changed"),
        ),
      );
    assert.equal(logged.metadata.moved, 2);

    const settings = await getPublishingSettings(db, "owner", siteId);
    assert.equal(settings.types.find((t) => t.key === "post")?.pattern, "/blog/{yyyy}/{slug}");
    const doc = await getEntryDocument(db, "owner", siteId, hello);
    assert.equal(doc?.path, "/blog/2025/hello");
  });

  test("moving back removes the redirect away from the live address (no loops)", async () => {
    await saveUrlPatterns(db, "owner", siteId, { patterns: { post: "/posts/{slug}" } });
    const map = await redirectMap();
    assert.equal(map["/posts/hello"], undefined, "the live address no longer redirects");
    assert.equal(map["/blog/2025/hello"], "/posts/hello");
    assert.equal(map["/old-hello"], "/posts/hello", "still one hop");
    for (const [from, to] of Object.entries(map)) assert.notEqual(from, to);
    assert.ok(!Object.keys(map).some((from) => Object.values(map).includes(from)), "no chains");
  });

  test("the content API resolves and lists the new addresses", async () => {
    await saveUrlPatterns(db, "owner", siteId, { patterns: { post: "/blog/{yyyy}/{slug}" } });
    const site = await getDeliverySite(db, siteId);
    assert.ok(site);
    const live = await resolvePath(db, site, "/blog/2025/hello");
    assert.equal(live?.kind, "entry");
    assert.equal(live?.kind === "entry" && live.entry.url, "https://journal.test/blog/2025/hello");
    assert.equal(await resolvePath(db, site, "/blog/2024/hello"), null, "the year must match");
    assert.deepEqual(await resolvePath(db, site, "/posts/hello"), {
      kind: "redirect",
      to: "/blog/2025/hello",
      statusCode: 301,
    });
    const sitemap = await listSitemap(db, site);
    assert.ok(sitemap.some((item) => item.path === "/blog/2025/second"));
    assert.ok(!sitemap.some((item) => item.path.startsWith("/posts/")));
  });

  test("slug changes and new content types follow the patterns", async () => {
    const id = await publishedPost("slug-test");
    const state = await changeSlug(db, "owner", siteId, id, {
      slug: "renamed",
      createRedirect: true,
      expectedUpdatedAt: await version(id),
    });
    assert.ok(state.redirectCreated);
    assert.equal((await redirectMap())["/blog/2025/slug-test"], "/blog/2025/renamed");

    await saveUrlPatterns(db, "owner", siteId, {
      patterns: { post: "/stories/{slug}" },
    });
    // A new type keyed "stories" would get /stories/…, which posts now use.
    await assert.rejects(
      createModel(db, "owner", siteId, {
        key: "stories",
        name: "Stories",
        description: "",
        schemaType: "",
      }),
      /already used by Post \(/,
    );
    await assert.rejects(
      createTaxonomy(db, "owner", siteId, {
        key: "stories",
        name: "Stories",
        description: "",
        hierarchical: false,
        modelKeys: [],
      }),
      /already used by Post \(/,
    );
  });
});

describe("publishing rules", () => {
  test("only owners and admins change them; the default type must exist", async () => {
    await assert.rejects(
      savePublishingRules(db, "editor", siteId, { requireReview: true, defaultModelKey: "post" }),
      NotAllowedError,
    );
    await assert.rejects(
      savePublishingRules(db, "owner", siteId, { requireReview: false, defaultModelKey: "nope" }),
      PublishingValidationError,
    );
    await savePublishingRules(db, "owner", siteId, {
      requireReview: false,
      defaultModelKey: "page",
    });
    assert.equal(await getDefaultModelKey(db, siteId), "page");
    await savePublishingRules(db, "owner", siteId, {
      requireReview: false,
      defaultModelKey: "post",
    });
    assert.equal(await getDefaultModelKey(db, siteId), "post");
  });

  test("require review: editors send drafts for review and can't approve their own", () => {
    const rules = { requireReview: true };
    const draft = { status: "draft" as const, authorId: "editor", publishedAt: null };
    const editor = workflowActions("editor", "editor", draft, rules);
    assert.equal(editor.publish, false);
    assert.equal(editor.schedule, false);
    assert.equal(editor.submit, true);
    const own = { ...draft, status: "in_review" as const, reviewRequestedById: "editor" };
    assert.equal(workflowActions("editor", "editor", own, rules).publish, false);
    assert.equal(workflowActions("editor", "editor", own, rules).withdraw, true);
    assert.equal(workflowActions("editor", "editor2", own, rules).publish, true);
    assert.equal(workflowActions("owner", "owner", draft, rules).publish, true, "owners bypass");
    assert.equal(workflowActions("editor", "editor", draft).publish, true, "rule off");
  });

  test("the rule is enforced on the server", async () => {
    await savePublishingRules(db, "admin", siteId, {
      requireReview: true,
      defaultModelKey: "post",
    });
    const id = await draftPost("Needs review", "editor");
    await assert.rejects(
      transitionEntry(db, "editor", siteId, id, {
        action: "publish",
        expectedUpdatedAt: await version(id),
      }),
      /requires a review/,
    );
    await assert.rejects(
      transitionEntry(db, "editor", siteId, id, {
        action: "schedule",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        expectedUpdatedAt: await version(id),
      }),
      /requires a review/,
    );
    const sent = await transitionEntry(db, "editor", siteId, id, {
      action: "submit",
      expectedUpdatedAt: await version(id),
    });
    assert.equal(sent.status, "in_review");
    assert.equal(sent.reviewRequestedById, "editor");
    await assert.rejects(
      transitionEntry(db, "editor", siteId, id, {
        action: "publish",
        expectedUpdatedAt: sent.updatedAt,
      }),
      NotAllowedError,
      "can't approve your own request",
    );
    const approved = await transitionEntry(db, "editor2", siteId, id, {
      action: "publish",
      expectedUpdatedAt: sent.updatedAt,
    });
    assert.equal(approved.status, "published");
    assert.equal(approved.reviewRequestedById, null);

    const direct = await draftPost("Admin post", "admin");
    const published = await transitionEntry(db, "admin", siteId, direct, {
      action: "publish",
      expectedUpdatedAt: await version(direct),
    });
    assert.equal(published.status, "published", "admins can still publish directly");
    await savePublishingRules(db, "admin", siteId, {
      requireReview: false,
      defaultModelKey: "post",
    });
  });
});
