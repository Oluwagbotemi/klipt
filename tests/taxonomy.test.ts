import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { siteMembers, taxonomies, users, webhookDeliveries } from "@/server/db/schema";
import { createEntry } from "@/server/content";
import {
  getDeliverySite,
  getPublishedEntry,
  listPublished,
  listSitemap,
  listTaxonomyTerms,
  resolvePath,
  resolveTermFilters,
  type DeliverySite,
  type TermFilter,
} from "@/server/delivery";
import { getEntryDocument, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { createModel, ModelValidationError } from "@/server/models";
import { createSite } from "@/server/sites";
import {
  createTaxonomy,
  createTerm,
  deleteTaxonomy,
  deleteTerm,
  getEntryTaxonomies,
  listTaxonomies,
  listTerms,
  searchTerms,
  setEntryTerms,
  TaxonomyValidationError,
  updateTaxonomy,
  updateTerm,
} from "@/server/taxonomy";
import { createWebhook } from "@/server/webhooks";
import {
  canCreateTerm,
  descendantIds,
  flattenTree,
  taxonomyKeySchema,
  termPath,
  termSchema,
} from "@/lib/taxonomy";

process.env.BETTER_AUTH_URL = "https://cms.example";
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-webhook-encryption-0123456789";
process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1";

let db: Database;
let siteId: string;
let otherSiteId: string;
let site: DeliverySite;

const term = (name: string, slug: string, parentId = "") => ({
  name,
  slug,
  parentId,
  description: "",
  seoTitle: "",
  seoDescription: "",
});

async function publish(entryId: string) {
  const doc = await getEntryDocument(db, "owner", siteId, entryId);
  assert.ok(doc);
  await transitionEntry(db, "owner", siteId, entryId, {
    action: "publish",
    expectedUpdatedAt: doc.entry.updatedAt,
  });
}

async function filtered(filters: TermFilter[]) {
  const resolved = await resolveTermFilters(db, siteId, filters);
  assert.ok(resolved.ok);
  const list = await listPublished(db, site, { termSets: resolved.termSets, page: 1, limit: 50 });
  return list.items.map((item) => item.title).sort();
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "author", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Journal", domain: "journal.example" })).id;
  otherSiteId = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
  const found = await getDeliverySite(db, siteId);
  assert.ok(found);
  site = found;
});

describe("taxonomy rules (client-safe)", () => {
  test("keys, slugs and archive paths", () => {
    assert.equal(taxonomyKeySchema.safeParse("region").success, true);
    for (const bad of ["category", "tag", "posts", "R", "1x", "has space"]) {
      assert.equal(taxonomyKeySchema.safeParse(bad).success, false, bad);
    }
    assert.equal(termSchema.safeParse(term("News", "News Today")).success, false);
    assert.equal(termSchema.parse(term("News", "news")).parentId, null);
    assert.equal(termPath("category", "news"), "/category/news");
    assert.equal(termPath("region", "europe"), "/region/europe");
  });

  test("authors may create tags only; editors manage every term", () => {
    assert.equal(canCreateTerm("author", "tag"), true);
    assert.equal(canCreateTerm("author", "category"), false);
    assert.equal(canCreateTerm("editor", "category"), true);
    assert.equal(canCreateTerm("viewer", "tag"), false);
  });

  test("trees are ordered parent-first with depths", () => {
    const flat = flattenTree([
      { id: "c", name: "Child", parentId: "a" },
      { id: "b", name: "Beta", parentId: null },
      { id: "a", name: "Alpha", parentId: null },
      { id: "g", name: "Grandchild", parentId: "c" },
    ]);
    assert.deepEqual(
      flat.map((item) => [item.id, item.depth]),
      [
        ["a", 0],
        ["c", 1],
        ["g", 2],
        ["b", 0],
      ],
    );
    assert.deepEqual(
      [
        ...descendantIds(
          [
            { id: "a", parentId: null },
            { id: "c", parentId: "a" },
            { id: "g", parentId: "c" },
          ],
          "c",
        ),
      ].sort(),
      ["c", "g"],
    );
  });
});

describe("taxonomies", () => {
  test("every site starts with Categories and Tags", async () => {
    const list = await listTaxonomies(db, "viewer", siteId);
    assert.deepEqual(
      list.map((item) => [item.key, item.hierarchical, item.isSystem]),
      [
        ["category", true, true],
        ["tag", false, true],
      ],
    );
    await assert.rejects(listTaxonomies(db, "stranger", siteId), NotAllowedError);
  });

  test("custom taxonomies need models.manage and a free key", async () => {
    const input = {
      name: "Regions",
      key: "region",
      description: "",
      hierarchical: true,
      modelKeys: ["post"],
    };
    await assert.rejects(createTaxonomy(db, "editor", siteId, input), NotAllowedError);
    await assert.rejects(
      createTaxonomy(db, "admin", siteId, { ...input, modelKeys: ["nope"] }),
      TaxonomyValidationError,
    );
    await createModel(db, "owner", siteId, {
      name: "Products",
      key: "products",
      description: "",
      schemaType: "",
    });
    await assert.rejects(
      createTaxonomy(db, "admin", siteId, { ...input, key: "products" }),
      (error: unknown) => error instanceof TaxonomyValidationError && error.field === "key",
    );
    await createTaxonomy(db, "admin", siteId, input);
    await assert.rejects(createTaxonomy(db, "owner", siteId, input), TaxonomyValidationError);
    // …and a content type can't take a taxonomy's key either.
    await assert.rejects(
      createModel(db, "owner", siteId, {
        name: "R",
        key: "region",
        description: "",
        schemaType: "",
      }),
      ModelValidationError,
    );

    const [system] = await listTaxonomies(db, "owner", siteId);
    await assert.rejects(deleteTaxonomy(db, "owner", siteId, system.id), TaxonomyValidationError);
    await assert.rejects(
      updateTaxonomy(db, "owner", siteId, system.id, {
        name: "Topics",
        description: "",
        modelKeys: [],
      }),
      TaxonomyValidationError,
    );
  });

  test("custom taxonomies can be edited and deleted, keeping entries", async () => {
    const { id } = await createTaxonomy(db, "owner", siteId, {
      name: "Seasons",
      key: "season",
      description: "",
      hierarchical: false,
      modelKeys: ["post"],
    });
    await updateTaxonomy(db, "admin", siteId, id, {
      name: "Seasons",
      description: "When",
      modelKeys: ["post", "page"],
    });
    const summer = await createTerm(db, "editor", siteId, "season", term("Summer", "summer"));
    const entry = await createEntry(db, "owner", siteId, "page", "Summer sale");
    await setEntryTerms(db, "owner", siteId, entry.id, "season", [summer.id]);
    await deleteTaxonomy(db, "owner", siteId, id);
    const doc = await getEntryDocument(db, "owner", siteId, entry.id);
    assert.equal(doc?.entry.title, "Summer sale");
    assert.equal((await listTerms(db, "owner", siteId, "season")) === null, true);
  });
});

describe("terms", () => {
  test("managing terms needs taxonomy.manage; authors may add tags", async () => {
    await assert.rejects(
      createTerm(db, "author", siteId, "category", term("Nope", "nope")),
      NotAllowedError,
    );
    await assert.rejects(
      createTerm(db, "viewer", siteId, "tag", term("Nope", "nope")),
      NotAllowedError,
    );
    const tag = await createTerm(db, "author", siteId, "tag", term("Recipes", "recipes"));
    await assert.rejects(
      updateTerm(db, "author", siteId, tag.id, term("Food", "food")),
      NotAllowedError,
    );
    await assert.rejects(deleteTerm(db, "author", siteId, tag.id), NotAllowedError);
    await assert.rejects(
      createTerm(db, "stranger", siteId, "tag", term("X", "x")),
      NotAllowedError,
    );
    await assert.rejects(
      createTerm(db, "editor", siteId, "tag", term("Recipes again", "recipes")),
      (error: unknown) => error instanceof TaxonomyValidationError && error.field === "slug",
    );
    // The same slug is fine in another taxonomy.
    await createTerm(db, "editor", siteId, "category", term("Recipes", "recipes"));
  });

  test("nesting: no parents for flat taxonomies, no cycles, at most three levels", async () => {
    const tag = (await searchTerms(db, "owner", siteId, "tag", "recipes"))[0];
    await assert.rejects(
      createTerm(db, "editor", siteId, "tag", term("Child", "child", tag.id)),
      TaxonomyValidationError,
    );
    const a = await createTerm(db, "editor", siteId, "category", term("Guides", "guides"));
    const b = await createTerm(db, "editor", siteId, "category", term("SEO", "seo", a.id));
    const c = await createTerm(db, "editor", siteId, "category", term("Links", "links", b.id));
    await assert.rejects(
      createTerm(db, "editor", siteId, "category", term("Too deep", "too-deep", c.id)),
      /3 levels/,
    );
    // A parent from another taxonomy (or site) is refused.
    await assert.rejects(
      createTerm(db, "editor", siteId, "category", term("Odd", "odd", tag.id)),
      TaxonomyValidationError,
    );
    // Cycles: a term can't move under itself or its descendants.
    await assert.rejects(
      updateTerm(db, "editor", siteId, a.id, term("Guides", "guides", c.id)),
      /inside itself/,
    );
    await assert.rejects(
      updateTerm(db, "editor", siteId, a.id, term("Guides", "guides", a.id)),
      /inside itself/,
    );
    // Moving a two-level subtree under a second-level term would make four levels.
    const news = await createTerm(db, "editor", siteId, "category", term("News", "news"));
    const local = await createTerm(
      db,
      "editor",
      siteId,
      "category",
      term("Local", "local", news.id),
    );
    await assert.rejects(
      updateTerm(db, "editor", siteId, b.id, term("SEO", "seo", local.id)),
      /3 levels/,
    );
    // Moving a leaf there is fine.
    await updateTerm(db, "editor", siteId, c.id, term("Links", "links", local.id));

    // Deleting a parent moves its children up.
    await deleteTerm(db, "editor", siteId, local.id);
    const list = await listTerms(db, "viewer", siteId, "category");
    assert.equal(list?.terms.find((item) => item.id === c.id)?.parentId, news.id);
  });
});

describe("entries", () => {
  let postId: string;
  let pageId: string;
  let ids: Record<string, string>;

  before(async () => {
    const terms = (await listTerms(db, "owner", siteId, "category"))!.terms;
    ids = Object.fromEntries(terms.map((item) => [item.slug, item.id]));
    ids.recipesTag = (await searchTerms(db, "owner", siteId, "tag", "recipes"))[0].id;
    postId = (await createEntry(db, "author", siteId, "post", "Author post")).id;
    pageId = (await createEntry(db, "owner", siteId, "page", "About")).id;
  });

  test("the editor sees the taxonomies its type uses", async () => {
    const forPost = await getEntryTaxonomies(db, "author", siteId, postId);
    assert.deepEqual(
      forPost.map((item) => item.key),
      ["category", "tag", "region"],
    );
    const forPage = await getEntryTaxonomies(db, "owner", siteId, pageId);
    assert.deepEqual(
      forPage.map((item) => item.key),
      ["category", "tag"],
    );
    const tags = forPost.find((item) => item.key === "tag");
    assert.equal(tags?.canCreate, true);
    assert.equal(forPost.find((item) => item.key === "category")?.canCreate, false);
    // Flat taxonomies only list assigned terms; the rest come from search.
    assert.deepEqual(tags?.terms, []);
  });

  test("assigning terms follows edit rights and doesn't change the entry version", async () => {
    const before = (await getEntryDocument(db, "author", siteId, postId))!.entry.updatedAt;
    await setEntryTerms(db, "author", siteId, postId, "category", [ids.news, ids.links]);
    await setEntryTerms(db, "author", siteId, postId, "tag", [ids.recipesTag]);
    const after = (await getEntryDocument(db, "author", siteId, postId))!.entry.updatedAt;
    assert.equal(after, before);
    const forPost = await getEntryTaxonomies(db, "author", siteId, postId);
    assert.deepEqual(forPost[0].selected.sort(), [ids.news, ids.links].sort());

    await assert.rejects(
      setEntryTerms(db, "viewer", siteId, postId, "category", []),
      NotAllowedError,
    );
    // Authors can't change someone else's entry.
    await assert.rejects(
      setEntryTerms(db, "author", siteId, pageId, "category", [ids.news]),
      NotAllowedError,
    );
    // Terms must belong to the taxonomy, and the taxonomy to the type.
    await assert.rejects(
      setEntryTerms(db, "owner", siteId, pageId, "category", [ids.recipesTag]),
      TaxonomyValidationError,
    );
    await assert.rejects(
      setEntryTerms(db, "owner", siteId, pageId, "region", []),
      TaxonomyValidationError,
    );
    await assert.rejects(
      setEntryTerms(db, "stranger", otherSiteId, postId, "category", []),
      NotAllowedError,
    );
  });

  test("live entries queue entry.updated when their terms change", async () => {
    const hook = await createWebhook(db, "owner", siteId, {
      url: "http://127.0.0.1:9/hook",
      events: ["entry.updated"],
    });
    await publish(postId);
    const updates = async () =>
      (
        await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hook.id))
      ).filter((row) => row.event === "entry.updated").length;
    const start = await updates();
    await setEntryTerms(db, "owner", siteId, postId, "tag", []);
    assert.ok((await updates()) > start);
    // Drafts don't.
    const queued = await updates();
    await setEntryTerms(db, "owner", siteId, pageId, "tag", [ids.recipesTag]);
    assert.equal(await updates(), queued);
    await setEntryTerms(db, "owner", siteId, postId, "tag", [ids.recipesTag]);
  });

  test("the content API includes terms and filters by them", async () => {
    const entry = await getPublishedEntry(db, site, "post", "author-post");
    assert.ok(entry);
    assert.deepEqual(entry.taxonomies.category, [
      { name: "Links", slug: "links", path: "/category/links" },
      { name: "News", slug: "news", path: "/category/news" },
    ]);
    assert.deepEqual(entry.taxonomies.tag, [
      { name: "Recipes", slug: "recipes", path: "/tag/recipes" },
    ]);
    assert.deepEqual(entry.taxonomies.region, []);

    await publish(pageId);
    assert.deepEqual(await filtered([{ taxonomy: "category", slug: "links" }]), ["Author post"]);
    // A parent category includes entries in its children.
    assert.deepEqual(await filtered([{ taxonomy: "category", slug: "news" }]), ["Author post"]);
    assert.deepEqual(await filtered([{ taxonomy: "tag", slug: "recipes" }]), [
      "About",
      "Author post",
    ]);
    assert.deepEqual(
      await filtered([
        { taxonomy: "tag", slug: "recipes" },
        { taxonomy: "category", slug: "news" },
      ]),
      ["Author post"],
    );
    assert.deepEqual(await filtered([{ taxonomy: "category", slug: "guides" }]), []);
    const unknown = await resolveTermFilters(db, siteId, [{ taxonomy: "region", slug: "mars" }]);
    assert.equal(unknown.ok, false);
  });

  test("taxonomy listings count published entries, as a tree when nested", async () => {
    const categories = await listTaxonomyTerms(db, site, "category");
    assert.ok(categories);
    const news = categories.terms.find((item) => item.slug === "news");
    assert.equal(news?.count, 1);
    assert.deepEqual(
      news?.children?.map((child) => [child.slug, child.count]),
      [["links", 1]],
    );
    const guides = categories.terms.find((item) => item.slug === "guides");
    assert.deepEqual(
      guides?.children?.map((child) => child.slug),
      ["seo"],
    );
    const tags = await listTaxonomyTerms(db, site, "tag");
    assert.deepEqual(
      tags?.terms.map((item) => [item.slug, item.count, item.children]),
      [["recipes", 2, undefined]],
    );
    assert.equal(await listTaxonomyTerms(db, site, "nope"), null);
    const other = await getDeliverySite(db, otherSiteId);
    const otherTags = await listTaxonomyTerms(db, other!, "tag");
    assert.deepEqual(otherTags?.terms, []);
  });

  test("the sitemap lists archives that have published entries", async () => {
    const sitemap = await listSitemap(db, site);
    const archives = sitemap.filter((item) => item.kind === "term").map((item) => item.path);
    assert.deepEqual(archives, ["/category/links", "/category/news", "/tag/recipes"]);
  });

  test("/resolve recognises term archive paths", async () => {
    assert.deepEqual(await resolvePath(db, site, "/category/news"), {
      kind: "term",
      taxonomy: "category",
      term: { name: "News", slug: "news", path: "/category/news" },
    });
    assert.equal(await resolvePath(db, site, "/category/nope"), null);
  });

  test("deleting a term keeps entries and reports counts in the dashboard", async () => {
    const list = await listTerms(db, "viewer", siteId, "tag");
    assert.equal(list?.terms.find((item) => item.slug === "recipes")?.entryCount, 2);
    await deleteTerm(db, "editor", siteId, ids.recipesTag);
    const entry = await getPublishedEntry(db, site, "post", "author-post");
    assert.ok(entry);
    assert.deepEqual(entry.taxonomies.tag, []);
  });

  test("every site gets its own system taxonomies", async () => {
    const rows = await db.select().from(taxonomies).where(eq(taxonomies.siteId, otherSiteId));
    assert.deepEqual(rows.map((row) => row.key).sort(), ["category", "tag"]);
  });
});
