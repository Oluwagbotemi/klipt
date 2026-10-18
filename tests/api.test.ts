import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { apiKeys, siteMembers, sites, users } from "@/server/db/schema";
import {
  ApiKeyLimitError,
  authenticateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/server/api-keys";
import { createEntry } from "@/server/content";
import {
  getDeliverySite,
  getPublishedEntry,
  listPublished,
  listRedirects,
  listSitemap,
  normalizePath,
  resolvePath,
  type DeliverySite,
} from "@/server/delivery";
import { changeSlug, getEntryDocument, saveEntry, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { createSite } from "@/server/sites";
import { MAX_API_KEYS } from "@/lib/api-keys";

let db: Database;
let siteId: string;
let otherSiteId: string;
let site: DeliverySite;

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** Creates an entry, saves body/SEO, and optionally publishes it. */
async function makeEntry(
  inSite: string,
  type: "page" | "post",
  title: string,
  options: { publish?: boolean; seo?: Record<string, unknown>; body?: unknown; as?: string } = {},
) {
  const user = options.as ?? "owner";
  const { id } = await createEntry(db, user, inSite, type, title);
  let doc = await getEntryDocument(db, user, inSite, id);
  assert.ok(doc);
  await saveEntry(db, user, inSite, id, {
    title,
    body: options.body ?? paragraph(`${title} body text.`),
    seo: options.seo ?? {},
    expectedUpdatedAt: doc.entry.updatedAt,
  });
  if (options.publish) {
    doc = await getEntryDocument(db, user, inSite, id);
    assert.ok(doc);
    await transitionEntry(db, user, inSite, id, {
      action: "publish",
      expectedUpdatedAt: doc.entry.updatedAt,
    });
  }
  const final = await getEntryDocument(db, user, inSite, id);
  assert.ok(final);
  return final;
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
  otherSiteId = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
  ]);
  const found = await getDeliverySite(db, siteId);
  assert.ok(found);
  site = found;
});

describe("API keys", () => {
  test("owners and admins manage keys; others can't", async () => {
    const { token } = await createApiKey(db, "admin", siteId, "  Marketing site ");
    assert.match(token, /^klipt_[A-Za-z0-9_-]{43}$/);
    const keys = await listApiKeys(db, "owner", siteId);
    const key = keys.find((k) => k.name === "Marketing site");
    assert.ok(key);
    assert.equal(key.prefix, token.slice(0, 12));
    assert.equal(key.createdByName, "User admin");

    await assert.rejects(createApiKey(db, "editor", siteId, "Nope"), NotAllowedError);
    await assert.rejects(listApiKeys(db, "editor", siteId), NotAllowedError);
    await assert.rejects(listApiKeys(db, "stranger", siteId), NotAllowedError);
    await assert.rejects(revokeApiKey(db, "stranger", siteId, key.id), NotAllowedError);
  });

  test("stores only a hash and authenticates to the key's site", async () => {
    const { id, token } = await createApiKey(db, "owner", siteId, "Website");
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    assert.notEqual(row.tokenHash, token);
    assert.ok(!JSON.stringify(row).includes(token));

    assert.deepEqual(await authenticateApiKey(db, token), { keyId: id, siteId });
    assert.equal(await authenticateApiKey(db, `${token}x`), null);
    assert.equal(await authenticateApiKey(db, "not-a-key"), null);
    const [used] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    assert.ok(used.lastUsedAt);
  });

  test("revoked keys stop working immediately and leave the list", async () => {
    const { id, token } = await createApiKey(db, "owner", siteId, "Old site");
    await revokeApiKey(db, "owner", siteId, id);
    assert.equal(await authenticateApiKey(db, token), null);
    assert.ok(!(await listApiKeys(db, "owner", siteId)).some((k) => k.id === id));
    await assert.rejects(revokeApiKey(db, "owner", siteId, id), NotAllowedError);
  });

  test("a key can't be revoked through another site", async () => {
    const { id, token } = await createApiKey(db, "owner", siteId, "Scoped");
    await assert.rejects(revokeApiKey(db, "owner", otherSiteId, id), NotAllowedError);
    assert.ok(await authenticateApiKey(db, token));
  });

  test("keys stop working when the site is archived", async () => {
    const archivedSite = (await createSite(db, "owner", { name: "Gone", domain: null })).id;
    const { token } = await createApiKey(db, "owner", archivedSite, "Key");
    await db.update(sites).set({ archivedAt: new Date() }).where(eq(sites.id, archivedSite));
    assert.equal(await authenticateApiKey(db, token), null);
  });

  test("limits active keys per site", async () => {
    const limited = (await createSite(db, "owner", { name: "Limited", domain: null })).id;
    for (let i = 0; i < MAX_API_KEYS; i++) await createApiKey(db, "owner", limited, `Key ${i}`);
    await assert.rejects(createApiKey(db, "owner", limited, "One more"), ApiKeyLimitError);
  });

  test("rejects empty names", async () => {
    await assert.rejects(createApiKey(db, "owner", siteId, "   "));
  });
});

describe("content delivery", () => {
  let publishedPost: Awaited<ReturnType<typeof makeEntry>>;

  before(async () => {
    publishedPost = await makeEntry(siteId, "post", "Hello world", {
      publish: true,
      seo: { description: "A friendly first post." },
      body: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "click",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      },
    });
    await makeEntry(siteId, "post", "Secret draft");
    await makeEntry(siteId, "page", "About", { publish: true });
    await makeEntry(siteId, "page", "Hidden page", { publish: true, seo: { index: false } });
    await makeEntry(siteId, "page", "Syndicated", {
      publish: true,
      seo: { canonicalUrl: "https://elsewhere.example/original" },
    });
    await makeEntry(otherSiteId, "post", "Other site post", { publish: true, as: "stranger" });
  });

  test("lists only this site's published entries", async () => {
    const all = await listPublished(db, site, { page: 1, limit: 50 });
    const titles = all.items.map((item) => item.title).sort();
    assert.deepEqual(titles, ["About", "Hello world", "Hidden page", "Syndicated"]);

    const posts = await listPublished(db, site, { type: "post", page: 1, limit: 50 });
    assert.deepEqual(
      posts.items.map((item) => item.title),
      ["Hello world"],
    );
    const [post] = posts.items;
    assert.equal(post.path, "/posts/hello-world");
    assert.equal(post.url, "https://blog.example/posts/hello-world");
    assert.equal(post.excerpt, "A friendly first post.");
    assert.deepEqual(post.author, { name: "User owner" });
  });

  test("paginates", async () => {
    const first = await listPublished(db, site, { page: 1, limit: 3 });
    assert.equal(first.items.length, 3);
    assert.equal(first.total, 4);
    assert.equal(first.hasMore, true);
    const second = await listPublished(db, site, { page: 2, limit: 3 });
    assert.equal(second.items.length, 1);
    assert.equal(second.hasMore, false);
  });

  test("returns a full entry with sanitized HTML and resolved SEO", async () => {
    const entry = await getPublishedEntry(db, site, "post", "hello-world");
    assert.ok(entry);
    assert.match(entry.body.html, /<h2>Intro<\/h2>/);
    assert.ok(!entry.body.html.includes("javascript:"));
    assert.equal(entry.seo.title, "Hello world");
    assert.equal(entry.seo.canonicalUrl, "https://blog.example/posts/hello-world");
    assert.equal(entry.seo.robots, "index, follow");
    assert.equal(entry.seo.schemaType, "Article");
    assert.equal(entry.seo.openGraph.description, "A friendly first post.");

    const hidden = await getPublishedEntry(db, site, "page", "hidden-page");
    assert.equal(hidden?.seo.robots, "noindex, follow");
    assert.equal(await getPublishedEntry(db, site, "post", "secret-draft"), null);
    assert.equal(await getPublishedEntry(db, site, "page", "hello-world"), null);
  });

  test("resolves paths to entries and old URLs to redirects", async () => {
    const page = await resolvePath(db, site, "/about/");
    assert.equal(page?.kind, "entry");

    const post = await resolvePath(db, site, "/posts/hello-world?utm=1");
    assert.equal(post?.kind === "entry" && post.entry.id, publishedPost.entry.id);

    const doc = await getEntryDocument(db, "owner", siteId, publishedPost.entry.id);
    assert.ok(doc);
    await changeSlug(db, "owner", siteId, publishedPost.entry.id, {
      slug: "hello-again",
      createRedirect: true,
      expectedUpdatedAt: doc.entry.updatedAt,
    });
    assert.deepEqual(await resolvePath(db, site, "/posts/hello-world"), {
      kind: "redirect",
      to: "/posts/hello-again",
      statusCode: 301,
    });
    assert.deepEqual(await listRedirects(db, siteId), [
      { from: "/posts/hello-world", to: "/posts/hello-again", statusCode: 301 },
    ]);

    assert.equal(await resolvePath(db, site, "/posts/secret-draft"), null);
    assert.equal(await resolvePath(db, site, "/post/hello-again"), null);
    assert.equal(await resolvePath(db, site, "https://evil.example/about"), null);
  });

  test("sitemap leaves out noindex and externally canonical entries", async () => {
    const sitemap = await listSitemap(db, site);
    assert.deepEqual(
      sitemap.map((item) => item.path),
      ["/about", "/posts/hello-again"],
    );
    assert.equal(sitemap[0].url, "https://blog.example/about");
  });

  test("normalizes paths", () => {
    assert.equal(normalizePath("/posts/a/?x=1#y"), "/posts/a");
    assert.equal(normalizePath("/"), "/");
    assert.equal(normalizePath("//evil.example"), null);
    assert.equal(normalizePath("posts/a"), null);
  });
});
