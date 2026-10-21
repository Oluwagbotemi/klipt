import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import {
  contentEntries,
  menuItems,
  siteMembers,
  users,
  webhookDeliveries,
  webhooks,
} from "@/server/db/schema";
import { createEntry } from "@/server/content";
import { changeSlug, getEntryDocument, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import {
  createMenu,
  deleteMenu,
  getDeliveryMenu,
  getMenu,
  listDeliveryMenus,
  listMenus,
  MenuConflictError,
  MenuKeyTakenError,
  MenuValidationError,
  saveMenu,
  searchMenuTargets,
} from "@/server/menus";
import { createSite } from "@/server/sites";
import { createWebhook } from "@/server/webhooks";
import {
  canIndent,
  canMoveDown,
  canMoveUp,
  canOutdent,
  indent,
  moveDown,
  moveUp,
  outdent,
  removeAt,
} from "@/lib/menu-tree";
import { isAllowedMenuUrl, type MenuItemInput } from "@/lib/menus";
import { can } from "@/lib/permissions";
import { DEFAULT_WEBHOOK_EVENTS } from "@/lib/webhooks";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-webhook-encryption-0123456789";
process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "1";

let db: Database;
let siteId: string;
let otherSiteId: string;

async function version(entryId: string) {
  const doc = await getEntryDocument(db, "owner", siteId, entryId);
  assert.ok(doc);
  return doc.entry.updatedAt;
}

async function publishedEntry(model: "page" | "post", title: string) {
  const { id } = await createEntry(db, "owner", siteId, model, title);
  await transitionEntry(db, "owner", siteId, id, {
    action: "publish",
    expectedUpdatedAt: await version(id),
  });
  return id;
}

async function save(key: string, items: MenuItemInput[], userId = "owner") {
  const menu = await getMenu(db, userId, siteId, key);
  assert.ok(menu);
  return saveMenu(db, userId, siteId, key, { items, expectedUpdatedAt: menu.updatedAt });
}

const url = (label: string, href: string, depth = 0): MenuItemInput => ({
  label,
  kind: "url",
  url: href,
  depth,
});
const entry = (label: string, entryId: string, depth = 0): MenuItemInput => ({
  label,
  kind: "entry",
  entryId,
  depth,
});

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "author", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
  otherSiteId = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

beforeEach(async () => {
  await db.delete(webhooks).where(eq(webhooks.siteId, siteId));
  await db.delete(menuItems).where(eq(menuItems.siteId, siteId));
});

describe("permissions", () => {
  test("owner, admin and editor manage navigation; others read only", () => {
    assert.ok(can("owner", "navigation.manage"));
    assert.ok(can("admin", "navigation.manage"));
    assert.ok(can("editor", "navigation.manage"));
    assert.ok(!can("author", "navigation.manage"));
    assert.ok(!can("viewer", "navigation.manage"));
  });

  test("header and footer are created lazily and listed first", async () => {
    const list = await listMenus(db, "viewer", siteId);
    assert.deepEqual(
      list.map((menu) => [menu.key, menu.isSystem]),
      [
        ["header", true],
        ["footer", true],
      ],
    );
  });

  test("authors and viewers can read but not save, create or delete", async () => {
    for (const userId of ["author", "viewer"]) {
      assert.ok(await getMenu(db, userId, siteId, "header"));
      await assert.rejects(save("header", [url("Home", "/")], userId), NotAllowedError);
      await assert.rejects(
        createMenu(db, userId, siteId, { name: "Legal", key: "legal" }),
        NotAllowedError,
      );
    }
    await save("header", [url("Home", "/")], "editor");
  });

  test("non-members see nothing", async () => {
    await assert.rejects(listMenus(db, "stranger", siteId), NotAllowedError);
    await assert.rejects(getMenu(db, "stranger", siteId, "header"), NotAllowedError);
  });

  test("custom menus: create, reject duplicate or reserved keys, delete; system menus stay", async () => {
    await createMenu(db, "editor", siteId, { name: "Legal links", key: "legal" });
    await assert.rejects(
      createMenu(db, "editor", siteId, { name: "Again", key: "legal" }),
      MenuKeyTakenError,
    );
    await assert.rejects(createMenu(db, "editor", siteId, { name: "Hdr", key: "header" }));
    await assert.rejects(createMenu(db, "editor", siteId, { name: "Bad", key: "Bad Key" }));
    assert.deepEqual(
      (await listMenus(db, "owner", siteId)).map((menu) => menu.key),
      ["header", "footer", "legal"],
    );
    await assert.rejects(deleteMenu(db, "author", siteId, "legal"), NotAllowedError);
    await assert.rejects(deleteMenu(db, "owner", siteId, "header"), NotAllowedError);
    await deleteMenu(db, "editor", siteId, "legal");
    assert.equal(await getMenu(db, "owner", siteId, "legal"), null);
  });
});

describe("validation", () => {
  test("allows https, relative paths, fragments, mailto and tel only", () => {
    for (const ok of [
      "https://example.com/docs",
      "/pricing",
      "/",
      "#team",
      "mailto:hi@example.com",
      "tel:+15551234",
    ]) {
      assert.ok(isAllowedMenuUrl(ok), ok);
    }
    for (const bad of [
      "http://example.com",
      "javascript:alert(1)",
      "//evil.example",
      "/\\evil.example",
      "ftp://example.com",
      "pricing",
      "data:text/html,hi",
      "",
      "https://exa mple.com",
    ]) {
      assert.ok(!isAllowedMenuUrl(bad), bad);
    }
  });

  test("rejects bad URLs, empty labels and too-deep or orphaned nesting", async () => {
    await assert.rejects(save("header", [url("Bad", "javascript:alert(1)")]), MenuValidationError);
    await assert.rejects(save("header", [url("  ", "/")]), MenuValidationError);
    await assert.rejects(
      save("header", [url("Orphan", "/a", 1)]),
      (error: MenuValidationError) => error.index === 0,
    );
    await assert.rejects(
      save("header", [url("Top", "/"), url("Child", "/a", 1), url("Grandchild", "/b", 2)]),
      MenuValidationError,
    );
  });

  test("rejects entries from another site", async () => {
    const { id } = await createEntry(db, "stranger", otherSiteId, "page", "Elsewhere");
    await assert.rejects(save("header", [entry("Elsewhere", id)]), MenuValidationError);
  });

  test("saving with a stale version is a conflict, never an overwrite", async () => {
    const stale = (await getMenu(db, "owner", siteId, "header"))!.updatedAt;
    await save("header", [url("First", "/")]);
    await assert.rejects(
      saveMenu(db, "editor", siteId, "header", {
        items: [url("Second", "/")],
        expectedUpdatedAt: stale,
      }),
      MenuConflictError,
    );
    const menu = await getMenu(db, "owner", siteId, "header");
    assert.deepEqual(
      menu!.items.map((item) => item.label),
      ["First"],
    );
  });
});

describe("ordering and nesting", () => {
  test("keeps order and rebuilds depth from saved parents", async () => {
    const saved = await save("footer", [
      url("Company", "/about"),
      url("Team", "/team", 1),
      url("Jobs", "https://jobs.example.com", 1),
      url("Contact", "mailto:hi@blog.example"),
      url("Call", "tel:+15551234", 1),
    ]);
    assert.deepEqual(
      saved.items.map((item) => [item.label, item.depth]),
      [
        ["Company", 0],
        ["Team", 1],
        ["Jobs", 1],
        ["Contact", 0],
        ["Call", 1],
      ],
    );
    const reordered = await save(
      "footer",
      saved.items
        .map((item) => ({ ...item }))
        .reverse()
        .map((item, index) => ({
          ...item,
          depth: index === 0 ? 0 : item.depth,
        })),
    );
    assert.deepEqual(
      reordered.items.map((item) => [item.label, item.depth]),
      [
        ["Call", 0],
        ["Contact", 0],
        ["Jobs", 1],
        ["Team", 1],
        ["Company", 0],
      ],
    );
  });
});

describe("entry links", () => {
  test("follow URL changes, flag unpublished and deleted targets, and search finds entries", async () => {
    const about = await publishedEntry("page", "About us");
    const news = await publishedEntry("post", "Launch news");
    const draft = (await createEntry(db, "owner", siteId, "page", "Secret plans")).id;
    const doomed = await publishedEntry("page", "Old page");

    const results = await searchMenuTargets(db, "editor", siteId, "launch");
    assert.deepEqual(
      results.map((target) => [target.title, target.path]),
      [["Launch news", "/posts/launch-news"]],
    );

    await save("header", [
      entry("About", about),
      entry("News", news, 1),
      entry("Plans", draft, 1),
      entry("Old", doomed),
      url("Docs", "https://docs.example.com"),
    ]);
    await changeSlug(db, "owner", siteId, about, {
      slug: "company",
      createRedirect: true,
      expectedUpdatedAt: await version(about),
    });
    await db.delete(contentEntries).where(eq(contentEntries.id, doomed));

    const menu = (await getMenu(db, "owner", siteId, "header"))!;
    assert.deepEqual(
      menu.items.map((item) => [item.label, item.target?.path ?? null, item.warning]),
      [
        ["About", "/company", null],
        ["News", "/posts/launch-news", null],
        ["Plans", "/secret-plans", "unpublished"],
        ["Old", null, "deleted"],
        ["Docs", null, null],
      ],
    );
    const summary = (await listMenus(db, "owner", siteId)).find((m) => m.key === "header")!;
    assert.equal(summary.itemCount, 5);
    assert.equal(summary.warningCount, 2);

    // The menu with a deleted target can still be saved (the item stays flagged).
    await saveMenu(db, "editor", siteId, "header", {
      items: menu.items,
      expectedUpdatedAt: menu.updatedAt,
    });

    const api = await getDeliveryMenu(db, siteId, "header");
    assert.deepEqual(api?.items, [
      {
        label: "About",
        url: "/company",
        openInNewTab: false,
        children: [{ label: "News", url: "/posts/launch-news", openInNewTab: false, children: [] }],
      },
      { label: "Docs", url: "https://docs.example.com", openInNewTab: false, children: [] },
    ]);
  });

  test("an unpublished parent hides its children in the API", async () => {
    const parent = (await createEntry(db, "owner", siteId, "page", "Hidden parent")).id;
    const child = await publishedEntry("page", "Visible child");
    await save("header", [entry("Parent", parent), entry("Child", child, 1), url("Home", "/")]);
    const api = await getDeliveryMenu(db, siteId, "header");
    assert.deepEqual(
      api?.items.map((item) => item.label),
      ["Home"],
    );
  });
});

describe("content API", () => {
  test("lists menu keys and returns nested items for one menu", async () => {
    await createMenu(db, "owner", siteId, { name: "Social", key: "social" });
    const keys = await listDeliveryMenus(db, siteId);
    assert.deepEqual(
      keys.map((menu) => menu.key),
      ["footer", "header", "social"],
    );
    const menu = await saveMenu(db, "owner", siteId, "social", {
      items: [{ ...url("Mastodon", "https://social.example/@blog"), openInNewTab: true }],
      expectedUpdatedAt: (await getMenu(db, "owner", siteId, "social"))!.updatedAt,
    });
    const api = await getDeliveryMenu(db, siteId, "social");
    assert.deepEqual(api, {
      key: "social",
      name: "Social",
      updatedAt: menu.updatedAt,
      items: [
        {
          label: "Mastodon",
          url: "https://social.example/@blog",
          openInNewTab: true,
          children: [],
        },
      ],
    });
    assert.equal(await getDeliveryMenu(db, siteId, "missing"), null);
    // Scoped by site: another site's API key can't read this site's custom menu.
    assert.equal(await getDeliveryMenu(db, otherSiteId, "social"), null);
    await deleteMenu(db, "owner", siteId, "social");
  });
});

describe("webhooks", () => {
  test("menu.updated is opt-in and queued when a menu is saved", async () => {
    assert.ok(!DEFAULT_WEBHOOK_EVENTS.includes("menu.updated"));
    const entryHook = await createWebhook(db, "owner", siteId, {
      url: "http://127.0.0.1:9/hook",
      events: DEFAULT_WEBHOOK_EVENTS,
    });
    const menuHook = await createWebhook(db, "owner", siteId, {
      url: "http://127.0.0.1:9/hook",
      events: ["menu.updated"],
    });
    await save("header", [url("Home", "/")]);
    const deliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(
        and(eq(webhookDeliveries.siteId, siteId), eq(webhookDeliveries.event, "menu.updated")),
      );
    assert.deepEqual(
      deliveries.map((row) => row.webhookId),
      [menuHook.id],
    );
    assert.notEqual(deliveries[0].webhookId, entryHook.id);
    assert.deepEqual(deliveries[0].payload, {
      site: { id: siteId, name: "Blog" },
      data: { menu: { key: "header", name: "Header" } },
    });
  });

  test("a refused save queues nothing", async () => {
    await createWebhook(db, "owner", siteId, {
      url: "http://127.0.0.1:9/hook",
      events: ["menu.updated"],
    });
    await assert.rejects(save("header", [url("Home", "/")], "author"));
    const [row] = await db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .where(
        and(eq(webhookDeliveries.siteId, siteId), eq(webhookDeliveries.event, "menu.updated")),
      );
    assert.equal(row, undefined);
  });
});

describe("editor reordering (keyboard buttons)", () => {
  const tree = (...spec: [string, number][]) => spec.map(([id, depth]) => ({ id, depth }));
  const show = (items: { id: string; depth: number }[]) =>
    items.map((item) => `${"-".repeat(item.depth)}${item.id}`).join(" ");
  const base = tree(["a", 0], ["a1", 1], ["a2", 1], ["b", 0], ["c", 0]);

  test("moves keep children with their parent and stay among siblings", () => {
    assert.equal(show(moveDown(base, 0)), "b a -a1 -a2 c");
    assert.equal(show(moveUp(base, 3)), "b a -a1 -a2 c");
    assert.equal(show(moveDown(base, 1)), "a -a2 -a1 b c");
    assert.ok(!canMoveUp(base, 1));
    assert.ok(!canMoveDown(base, 2));
    assert.ok(!canMoveDown(base, 4));
  });

  test("indent and outdent respect the depth limit", () => {
    assert.equal(show(indent(base, 3)), "a -a1 -a2 -b c");
    assert.ok(!canIndent(base, 0), "first item has nothing to go under");
    assert.ok(!canIndent(base, 2), "children can't go deeper");
    assert.ok(!canIndent(tree(["x", 0], ["a", 0], ["a1", 1]), 1), "parents can't become children");
    assert.equal(show(outdent(base, 1)), "a -a2 a1 b c");
    assert.ok(!canOutdent(base, 0));
  });

  test("remove takes the children too", () => {
    assert.equal(show(removeAt(base, 0)), "b c");
    assert.equal(show(removeAt(base, 2)), "a -a1 b c");
  });
});
