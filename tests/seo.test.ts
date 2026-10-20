import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { createPgliteDatabase, type Database } from "@/server/db";
import { siteMembers, users } from "@/server/db/schema";
import { createEntry } from "@/server/content";
import { getDeliverySite, getPublishedEntry, listSitemap, resolvePath } from "@/server/delivery";
import { changeSlug, getEntryDocument, saveEntry, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import {
  deleteRedirects,
  getSeoReport,
  listSiteRedirects,
  RedirectError,
  saveRedirect,
  setSearchVisibility,
} from "@/server/seo";
import { createSite } from "@/server/sites";
import type { RichTextNode } from "@/lib/editor/rich-text";
import { auditSite, internalLinks } from "@/lib/seo-audit";

let db: Database;
let siteId: string;

const para = (...parts: object[]) => ({ type: "paragraph", content: parts });
const text = (t: string) => ({ type: "text", text: t });
const link = (t: string, href: string) => ({
  type: "text",
  text: t,
  marks: [{ type: "link", attrs: { href } }],
});
const filler = (n = 60) => text(Array(n).fill("word").join(" ") + " ");

async function live(
  title: string,
  options: { type?: "post" | "page"; seo?: object; body?: object } = {},
) {
  const { id } = await createEntry(db, "owner", siteId, options.type ?? "page", title);
  const version = async () => (await getEntryDocument(db, "owner", siteId, id))!.entry.updatedAt;
  await saveEntry(db, "owner", siteId, id, {
    title,
    body: options.body ?? { type: "doc", content: [para(filler())] },
    seo: options.seo ?? { description: `About ${title}.` },
    expectedUpdatedAt: await version(),
  });
  await transitionEntry(db, "owner", siteId, id, {
    action: "publish",
    expectedUpdatedAt: await version(),
  });
  return id;
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "editor", "author", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Site", domain: "site.example" })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
  ]);
});

describe("audit helpers", () => {
  test("internal links: relative and own-domain URLs, not media or other sites", () => {
    const body = {
      type: "doc",
      content: [
        para(
          link("a", "/about/"),
          link("b", "https://www.site.example/posts/x?y=1"),
          link("c", "https://other.example/z"),
          link("d", "/media/sites/a/b.png"),
          link("e", "#top"),
        ),
      ],
    };
    assert.deepEqual(internalLinks(body as RichTextNode, "site.example"), ["/about", "/posts/x"]);
  });

  test("duplicates only count indexable pages", () => {
    const base = { slug: "a", modelKey: "page", body: { type: "doc" }, updatedAt: "" };
    const audit = auditSite(
      [
        { ...base, id: "1", title: "Same", slug: "one", seo: {} },
        { ...base, id: "2", title: "Same", slug: "two", seo: {} },
        { ...base, id: "3", title: "Same", slug: "three", seo: { index: false } },
      ],
      { domain: null, allowIndexing: true, altByMediaId: new Map(), redirectFrom: new Set() },
    );
    assert.equal(audit.issueCounts.duplicate_title, 2);
    assert.ok(!audit.pages[2].issues.includes("duplicate_title"));
  });
});

describe("SEO report", () => {
  test("finds broken links and orphans, and explains sitemap exclusions", async () => {
    await live("About");
    await live("Contact", {
      body: {
        type: "doc",
        content: [para(filler(), link("about", "/about"), link("gone", "/missing-page"))],
      },
    });
    await live("Hidden", { seo: { description: "Hidden.", index: false } });
    await live("Elsewhere", {
      seo: { description: "Copy.", canonicalUrl: "https://other.example/original" },
    });

    const report = await getSeoReport(db, "author", siteId);
    assert.equal(report.pages.length, 4);
    assert.deepEqual(report.broken, [
      {
        id: report.pages.find((p) => p.title === "Contact")!.id,
        title: "Contact",
        href: "/missing-page",
      },
    ]);
    assert.deepEqual(report.orphans.map((o) => o.title).sort(), ["Contact", "Elsewhere", "Hidden"]);
    const byTitle = Object.fromEntries(report.pages.map((p) => [p.title, p]));
    assert.equal(byTitle.Hidden.sitemapExclusion, "noindex");
    assert.equal(byTitle.Elsewhere.sitemapExclusion, "canonical_elsewhere");
    assert.equal(byTitle.About.inSitemap, true);
    assert.equal(report.inSitemap, 2);
    assert.equal(report.indexable, 3);
    await assert.rejects(getSeoReport(db, "stranger", siteId), NotAllowedError);
  });

  test("a redirect fixes a broken link", async () => {
    await saveRedirect(db, "editor", siteId, {
      from: "/missing-page",
      to: "/about",
      statusCode: 301,
    });
    const report = await getSeoReport(db, "owner", siteId);
    assert.deepEqual(report.broken, []);
  });
});

describe("redirects", () => {
  test("only SEO managers change redirects; values are normalized", async () => {
    await assert.rejects(
      saveRedirect(db, "author", siteId, { from: "/x", to: "/about", statusCode: 301 }),
      NotAllowedError,
    );
    const { id } = await saveRedirect(db, "owner", siteId, {
      from: "https://site.example/Old-Page/?utm=1",
      to: "/about/",
      statusCode: "302",
    });
    const row = (await listSiteRedirects(db, "author", siteId)).find((r) => r.id === id);
    assert.deepEqual([row?.from, row?.to, row?.statusCode], ["/Old-Page", "/about", 302]);
  });

  test("refuses duplicates, live pages, loops and bad input", async () => {
    const reject = (input: object, field: string) =>
      assert.rejects(saveRedirect(db, "owner", siteId, input), (error) => {
        assert.ok(error instanceof RedirectError, String(error));
        assert.equal(error.field, field);
        return true;
      });
    await reject({ from: "/Old-Page", to: "/contact", statusCode: 301 }, "from");
    await reject({ from: "/about", to: "/contact", statusCode: 301 }, "from");
    await reject({ from: "/", to: "/contact", statusCode: 301 }, "from");
    await reject({ from: "/loop", to: "/loop", statusCode: 301 }, "to");
    await reject({ from: "/a", to: "javascript:alert(1)", statusCode: 301 }, "to");
    await assert.rejects(
      saveRedirect(db, "owner", siteId, { from: "/a", to: "/b", statusCode: 307 }),
    );
  });

  test("keeps redirects one hop: follows targets and re-points older ones", async () => {
    await saveRedirect(db, "owner", siteId, { from: "/step-2", to: "/contact", statusCode: 301 });
    // Target that itself redirects: stored as the final destination.
    const a = await saveRedirect(db, "owner", siteId, {
      from: "/step-1",
      to: "/step-2",
      statusCode: 301,
    });
    assert.equal(a.to, "/contact");
    // A new redirect from an address others point at re-points them.
    await saveRedirect(db, "owner", siteId, { from: "/hop", to: "/about", statusCode: 301 });
    await saveRedirect(db, "owner", siteId, { from: "/older", to: "/hop", statusCode: 301 });
    const map = Object.fromEntries(
      (await listSiteRedirects(db, "owner", siteId)).map((r) => [r.from, r.to]),
    );
    assert.equal(map["/older"], "/about");
    // A redirect back to its own source (via another redirect) is a loop.
    await saveRedirect(db, "owner", siteId, { from: "/back", to: "/x-target", statusCode: 301 });
    await assert.rejects(
      saveRedirect(db, "owner", siteId, { from: "/x-target", to: "/back", statusCode: 301 }),
      /loop/,
    );
  });

  test("edit and delete", async () => {
    const [first] = await listSiteRedirects(db, "owner", siteId, "older");
    await saveRedirect(
      db,
      "editor",
      siteId,
      { from: first.from, to: "/contact", statusCode: 302 },
      first.id,
    );
    const [edited] = await listSiteRedirects(db, "owner", siteId, "older");
    assert.deepEqual([edited.to, edited.statusCode], ["/contact", 302]);
    assert.equal(await deleteRedirects(db, "editor", siteId, [first.id]), 1);
    assert.deepEqual(await listSiteRedirects(db, "owner", siteId, "older"), []);
    await assert.rejects(deleteRedirects(db, "author", siteId, [first.id]), NotAllowedError);
  });

  test("works with redirects made by URL changes", async () => {
    const id = await live("Moving post", { type: "post" });
    await changeSlug(db, "owner", siteId, id, {
      slug: "moved-post",
      createRedirect: true,
      expectedUpdatedAt: (await getEntryDocument(db, "owner", siteId, id))!.entry.updatedAt,
    });
    const [auto] = await listSiteRedirects(db, "owner", siteId, "moving-post");
    assert.equal(auto.entry?.title, "Moving post");
    const site = await getDeliverySite(db, siteId);
    assert.deepEqual(await resolvePath(db, site!, "/posts/moving-post"), {
      kind: "redirect",
      to: "/posts/moved-post",
      statusCode: 301,
    });
  });
});

describe("site search visibility", () => {
  test("turning it off hides everything from search engines", async () => {
    await assert.rejects(setSearchVisibility(db, "author", siteId, false), NotAllowedError);
    await setSearchVisibility(db, "editor", siteId, false);
    const site = await getDeliverySite(db, siteId);
    assert.equal(site?.allowIndexing, false);
    assert.deepEqual(await listSitemap(db, site!), []);
    const about = await getPublishedEntry(db, site!, "page", "about");
    assert.equal(about?.seo.robots, "noindex, nofollow");
    const report = await getSeoReport(db, "owner", siteId);
    assert.equal(report.indexable, 0);
    assert.ok(report.pages.every((p) => p.sitemapExclusion === "site_hidden"));

    await setSearchVisibility(db, "owner", siteId, true);
    const again = await getDeliverySite(db, siteId);
    assert.ok((await listSitemap(db, again!)).length > 0);
  });
});
