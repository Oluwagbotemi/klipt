import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { auditEvents, siteMembers, users } from "@/server/db/schema";
import { BrandImageError, getSiteBranding, setBrandImage } from "@/server/branding";
import { getDeliveryBranding, getDeliverySite } from "@/server/delivery";
import { NotAllowedError } from "@/server/errors";
import { deleteMedia, getMediaAsset, uploadMedia } from "@/server/media";
import { deleteSite } from "@/server/site-settings";
import { createSite, getSiteForUser } from "@/server/sites";
import { createLocalStorage } from "@/server/storage";
import { brandImageError, brandImageNote } from "@/lib/branding";
import { describeActivity } from "@/lib/activity";

process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "klipt-branding-"));
process.env.BETTER_AUTH_URL = "https://cms.example";

let db: Database;
let siteId: string;
const storage = createLocalStorage();

/** A PNG header with the given size (enough for Klipt's type and size sniffing). */
function png(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
const upload = (by: string, name: string, width: number, height: number, site = siteId) =>
  uploadMedia(db, storage, by, site, { name, bytes: png(width, height) });

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "author", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "author", role: "author" },
  ]);
});

describe("rules", () => {
  test("favicons must be PNG or WebP and at least 48px; logos take any supported image", () => {
    assert.equal(brandImageError("logo", { mimeType: "image/jpeg", width: 10, height: 10 }), null);
    assert.match(
      brandImageError("logo", { mimeType: "application/pdf", width: null, height: null }) ?? "",
      /PNG/,
    );
    assert.equal(
      brandImageError("favicon", { mimeType: "image/png", width: 512, height: 512 }),
      null,
    );
    assert.match(
      brandImageError("favicon", { mimeType: "image/jpeg", width: 512, height: 512 }) ?? "",
      /PNG or WebP/,
    );
    assert.match(
      brandImageError("favicon", { mimeType: "image/png", width: 32, height: 32 }) ?? "",
      /at least 48 × 48.*32 × 32/,
    );
  });

  test("notes are advice only: not square, or smaller than ideal", () => {
    const image = (width: number, height: number) => ({
      id: "x",
      url: "/x",
      width,
      height,
      altText: null,
    });
    assert.match(brandImageNote("favicon", image(512, 256)) ?? "", /isn't square/);
    assert.match(brandImageNote("favicon", image(64, 64)) ?? "", /512/);
    assert.equal(brandImageNote("favicon", image(512, 512)), null);
    assert.equal(brandImageNote("logo", image(900, 200)), null);
  });
});

describe("setting the logo and favicon", () => {
  test("admins set both; they show in site summaries and the content API", async () => {
    const logo = await upload("admin", "logo.png", 800, 200);
    const favicon = await upload("admin", "icon.png", 512, 512);
    await setBrandImage(db, "admin", siteId, "logo", logo.id);
    const branding = await setBrandImage(db, "owner", siteId, "favicon", favicon.id);
    assert.equal(branding.logo?.id, logo.id);
    assert.equal(branding.favicon?.width, 512);

    const summary = await getSiteForUser(db, "author", siteId);
    assert.equal(summary?.logoUrl, logo.url);
    assert.equal(summary?.faviconUrl, favicon.url);

    const site = await getDeliverySite(db, siteId);
    const api = await getDeliveryBranding(db, site!);
    assert.deepEqual(api.favicon, {
      url: `https://cms.example${favicon.url}`,
      width: 512,
      height: 512,
      alt: "",
    });
    assert.equal(api.logo?.width, 800);

    const actions = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.siteId, siteId), eq(auditEvents.targetType, "site")));
    assert.ok(actions.some((row) => row.action === "site.logo_changed"));
    assert.equal(describeActivity("site.favicon_changed", {}).verb, "changed the favicon");
    assert.equal(
      describeActivity("site.logo_changed", { removed: true }).verb,
      "removed the site logo",
    );
  });

  test("editors and authors can't change them, and strangers can't either", async () => {
    const image = await upload("editor", "mine.png", 600, 600);
    for (const who of ["editor", "author", "stranger"]) {
      await assert.rejects(setBrandImage(db, who, siteId, "logo", image.id), NotAllowedError);
    }
  });

  test("the server refuses a too-small favicon and files from another site", async () => {
    const tiny = await upload("admin", "tiny.png", 32, 32);
    await assert.rejects(
      setBrandImage(db, "admin", siteId, "favicon", tiny.id),
      (error: unknown) => error instanceof BrandImageError && /48 × 48/.test(error.message),
    );
    const other = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
    const foreign = await upload("stranger", "theirs.png", 512, 512, other);
    await assert.rejects(setBrandImage(db, "admin", siteId, "logo", foreign.id), BrandImageError);
  });

  test("the media library reports the use, and removing only unlinks", async () => {
    const before = await getSiteBranding(db, siteId);
    const asset = await getMediaAsset(db, "admin", siteId, before.favicon!.id);
    assert.deepEqual(asset?.brandUses, ["favicon"]);

    const after = await setBrandImage(db, "admin", siteId, "favicon", null);
    assert.equal(after.favicon, null);
    assert.ok(await getMediaAsset(db, "admin", siteId, before.favicon!.id), "file kept");
    const summary = await getSiteForUser(db, "owner", siteId);
    assert.equal(summary?.faviconUrl, null);
  });

  test("deleting the file clears the link (set null)", async () => {
    const logo = (await getSiteBranding(db, siteId)).logo!;
    const result = await deleteMedia(db, storage, "admin", siteId, [logo.id]);
    assert.equal(result.deleted, 1);
    assert.equal((await getSiteBranding(db, siteId)).logo, null);
    const site = await getDeliverySite(db, siteId);
    assert.deepEqual(await getDeliveryBranding(db, site!), { logo: null, favicon: null });
  });

  test("a branded site can still be deleted", async () => {
    const site = (await createSite(db, "owner", { name: "Temp", domain: null })).id;
    const image = await upload("owner", "temp.png", 512, 512, site);
    await setBrandImage(db, "owner", site, "favicon", image.id);
    await setBrandImage(db, "owner", site, "logo", image.id);
    await deleteSite(db, storage, "owner", site, "Temp");
    assert.equal(await getSiteForUser(db, "owner", site), null);
  });
});
