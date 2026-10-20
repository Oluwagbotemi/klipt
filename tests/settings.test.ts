import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { apiKeys, contentEntries, siteMembers, sites, users } from "@/server/db/schema";
import { authenticateApiKey, createApiKey } from "@/server/api-keys";
import { createEntry } from "@/server/content";
import { getDeliverySite, getPublishedEntry } from "@/server/delivery";
import { getEntryDocument, transitionEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { uploadMedia } from "@/server/media";
import {
  acceptTransfer,
  cancelTransfer,
  declineTransfer,
  getOwnershipState,
  previewTransfer,
  renewTransferLink,
  startTransfer,
  TransferError,
  transferLinkToken,
} from "@/server/ownership";
import {
  archiveSite,
  deleteSite,
  DomainTakenError,
  getSiteSettings,
  listArchivedSites,
  restoreSite,
  updateDomain,
  updateGeneralSettings,
  updateSeoDefaults,
} from "@/server/site-settings";
import { createSite, getSiteRole, listSitesForUser } from "@/server/sites";
import { createLocalStorage } from "@/server/storage";
import { applyTitleTemplate } from "@/lib/site-settings";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-settings-0123456789abcdef";
process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "klipt-settings-"));
process.env.BETTER_AUTH_URL = "https://cms.example";

let db: Database;
let siteId: string;
const user = (id: string) => ({ id, email: `${id}@test.local` });
const png = () => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, 1200);
  new DataView(bytes.buffer).setUint32(20, 630);
  return bytes;
};

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "newowner", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
  ]);
});

describe("general and domain", () => {
  test("admins update general settings; editors can't", async () => {
    await updateGeneralSettings(db, "admin", siteId, {
      name: "  The Blog ",
      language: "en-GB",
      timezone: "Africa/Lagos",
    });
    const settings = await getSiteSettings(db, "editor", siteId);
    assert.deepEqual(
      [settings.name, settings.language, settings.timezone],
      ["The Blog", "en-GB", "Africa/Lagos"],
    );
    await assert.rejects(
      updateGeneralSettings(db, "editor", siteId, { name: "X Y", language: "en", timezone: "UTC" }),
      NotAllowedError,
    );
    await assert.rejects(
      updateGeneralSettings(db, "owner", siteId, {
        name: "Ok",
        language: "en",
        timezone: "Mars/Base",
      }),
    );
  });

  test("domains are normalized, unique, and removable", async () => {
    await createSite(db, "stranger", { name: "Other", domain: "taken.example" });
    await updateDomain(db, "owner", siteId, { domain: "https://WWW.My-Blog.example/" });
    assert.equal((await getSiteSettings(db, "owner", siteId)).domain, "www.my-blog.example");
    await assert.rejects(
      updateDomain(db, "owner", siteId, { domain: "taken.example" }),
      DomainTakenError,
    );
    await updateDomain(db, "owner", siteId, { domain: "" });
    assert.equal((await getSiteSettings(db, "owner", siteId)).domain, null);
    await updateDomain(db, "owner", siteId, { domain: "blog.example" });
  });
});

describe("SEO defaults", () => {
  test("title template and default image reach the content API", async () => {
    assert.equal(applyTitleTemplate("%s | Blog", "Hello"), "Hello | Blog");
    await assert.rejects(
      updateSeoDefaults(db, "editor", siteId, { titleTemplate: "No placeholder" }),
    );
    const image = await uploadMedia(db, createLocalStorage(), "owner", siteId, {
      name: "share.png",
      bytes: png(),
    });
    await updateSeoDefaults(db, "editor", siteId, {
      titleTemplate: "%s | The Blog",
      ogImageId: image.id,
    });

    const { id } = await createEntry(db, "owner", siteId, "post", "Hello");
    const doc = await getEntryDocument(db, "owner", siteId, id);
    await transitionEntry(db, "owner", siteId, id, {
      action: "publish",
      expectedUpdatedAt: doc!.entry.updatedAt,
    });
    const site = await getDeliverySite(db, siteId);
    const entry = await getPublishedEntry(db, site!, "post", "hello");
    assert.equal(entry?.seo.title, "Hello");
    assert.equal(entry?.seo.documentTitle, "Hello | The Blog");
    assert.equal(entry?.seo.openGraph.image?.url, `https://cms.example${image.url}`);
    assert.equal(entry?.seo.openGraph.image?.width, 1200);

    const other = (await createSite(db, "stranger", { name: "Third", domain: null })).id;
    const foreign = await uploadMedia(db, createLocalStorage(), "stranger", other, {
      name: "x.png",
      bytes: png(),
    });
    await assert.rejects(
      updateSeoDefaults(db, "owner", siteId, { titleTemplate: "", ogImageId: foreign.id }),
      NotAllowedError,
    );
  });
});

describe("ownership transfer", () => {
  test("only the owner starts it; nothing changes until accepted", async () => {
    await assert.rejects(
      startTransfer(db, user("admin"), siteId, {
        email: "newowner@test.local",
        previousOwnerRetainsAdmin: true,
      }),
      NotAllowedError,
    );
    await assert.rejects(
      startTransfer(db, user("owner"), siteId, {
        email: "owner@test.local",
        previousOwnerRetainsAdmin: true,
      }),
      TransferError,
    );
    const token = await startTransfer(db, user("owner"), siteId, {
      email: "NewOwner@test.local",
      previousOwnerRetainsAdmin: true,
    });
    await assert.rejects(
      startTransfer(db, user("owner"), siteId, {
        email: "editor@test.local",
        previousOwnerRetainsAdmin: true,
      }),
      /already pending/,
    );
    assert.equal(await getSiteRole(db, "owner", siteId), "owner");
    const state = await getOwnershipState(db, "admin", siteId);
    assert.equal(state.pending?.recipientEmail, "newowner@test.local");
    assert.equal(await transferLinkToken(db, "owner", siteId), token);

    const preview = await previewTransfer(db, token);
    assert.equal(preview.state === "open" && preview.fromName, "User owner");
    await assert.rejects(acceptTransfer(db, user("editor"), token), /is for newowner@test\.local/);

    await acceptTransfer(db, user("newowner"), token);
    assert.equal(await getSiteRole(db, "newowner", siteId), "owner");
    assert.equal(await getSiteRole(db, "owner", siteId), "admin");
    const [{ owners }] = await db
      .select({ owners: db.$count(siteMembers, eq(siteMembers.role, "owner")) })
      .from(sites)
      .where(eq(sites.id, siteId));
    assert.ok(owners >= 1);
    assert.equal((await previewTransfer(db, token)).state, "closed");
    assert.equal((await getOwnershipState(db, "newowner", siteId)).history[0].status, "accepted");
  });

  test("renew, cancel, decline, and leaving without staying admin", async () => {
    const first = await startTransfer(db, user("newowner"), siteId, {
      email: "editor@test.local",
      previousOwnerRetainsAdmin: false,
    });
    const renewed = await renewTransferLink(db, "newowner", siteId);
    assert.equal((await previewTransfer(db, first)).state, "invalid");
    await cancelTransfer(db, "newowner", siteId);
    assert.equal((await previewTransfer(db, renewed)).state, "closed");

    const t2 = await startTransfer(db, user("newowner"), siteId, {
      email: "editor@test.local",
      previousOwnerRetainsAdmin: false,
    });
    await declineTransfer(db, user("editor"), t2);
    assert.equal(await getSiteRole(db, "newowner", siteId), "owner");

    const t3 = await startTransfer(db, user("newowner"), siteId, {
      email: "editor@test.local",
      previousOwnerRetainsAdmin: false,
    });
    await acceptTransfer(db, user("editor"), t3);
    assert.equal(await getSiteRole(db, "editor", siteId), "owner");
    assert.equal(await getSiteRole(db, "newowner", siteId), null);
  });

  test("a transfer to someone without an account waits for them", async () => {
    const token = await startTransfer(db, user("editor"), siteId, {
      email: "later@test.local",
      previousOwnerRetainsAdmin: true,
    });
    await db.insert(users).values({ id: "later", name: "Later", email: "later@test.local" });
    await acceptTransfer(db, user("later"), token);
    assert.equal(await getSiteRole(db, "later", siteId), "owner");
    assert.equal(await getSiteRole(db, "editor", siteId), "admin");
  });
});

describe("archive, restore, delete", () => {
  test("archiving hides the site and stops API keys; the owner can restore it", async () => {
    const site = (await createSite(db, "owner", { name: "Archive me", domain: null })).id;
    await db.insert(siteMembers).values({ siteId: site, userId: "admin", role: "admin" });
    const { token } = await createApiKey(db, "owner", site, "Key");
    await assert.rejects(archiveSite(db, "admin", site), NotAllowedError);
    await archiveSite(db, "owner", site);
    assert.ok(!(await listSitesForUser(db, "admin")).some((s) => s.id === site));
    assert.equal(await authenticateApiKey(db, token), null);
    assert.deepEqual(
      (await listArchivedSites(db, "owner")).map((s) => s.name),
      ["Archive me"],
    );
    assert.deepEqual(await listArchivedSites(db, "admin"), []);
    await assert.rejects(restoreSite(db, "admin", site), NotAllowedError);
    await restoreSite(db, "owner", site);
    assert.ok(await authenticateApiKey(db, token));
  });

  test("delete needs the owner and the exact name, and removes everything", async () => {
    const site = (await createSite(db, "owner", { name: "Delete me", domain: null })).id;
    await createEntry(db, "owner", site, "post", "Doomed");
    await createApiKey(db, "owner", site, "Key");
    await uploadMedia(db, createLocalStorage(), "owner", site, { name: "a.png", bytes: png() });
    await assert.rejects(deleteSite(db, null, "admin", site, "Delete me"), NotAllowedError);
    await assert.rejects(deleteSite(db, null, "owner", site, "delete me"), /exactly/);
    await deleteSite(db, createLocalStorage(), "owner", site, "Delete me");
    assert.equal((await db.select().from(sites).where(eq(sites.id, site))).length, 0);
    assert.equal(
      (await db.select().from(contentEntries).where(eq(contentEntries.siteId, site))).length,
      0,
    );
    assert.equal((await db.select().from(apiKeys).where(eq(apiKeys.siteId, site))).length, 0);
  });
});
