import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { createPgliteDatabase, type Database } from "@/server/db";
import { siteMembers, users } from "@/server/db/schema";
import { createEntry } from "@/server/content";
import { getDeliverySite, getPreviewEntry, getPublishedEntry } from "@/server/delivery";
import { getEntryDocument, saveEntry } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import {
  createPreviewLink,
  getPreviewUrl,
  setPreviewUrl,
  signPreviewToken,
  verifyPreviewToken,
} from "@/server/previews";
import { createSite } from "@/server/sites";
import { buildPreviewLink, previewUrlSchema } from "@/lib/previews";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-previews-0123456789abcdef";

let db: Database;
let siteId: string;
let otherSiteId: string;
let draftId: string;

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "author", "viewer", "stranger"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
  otherSiteId = (await createSite(db, "stranger", { name: "Other", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "author", role: "author" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
  draftId = (await createEntry(db, "author", siteId, "post", "Secret draft")).id;
  const doc = await getEntryDocument(db, "author", siteId, draftId);
  await saveEntry(db, "author", siteId, draftId, {
    title: "Secret draft",
    body: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Not live yet." }] }],
    },
    seo: {},
    expectedUpdatedAt: doc!.entry.updatedAt,
  });
});

describe("preview tokens", () => {
  test("sign and verify", () => {
    const { token, expiresAt } = signPreviewToken({ siteId: "s1", entryId: "e1" });
    const result = verifyPreviewToken(token);
    assert.ok(result.ok);
    assert.deepEqual([result.claims.siteId, result.claims.entryId], ["s1", "e1"]);
    assert.equal(result.claims.exp * 1000, expiresAt.getTime());
    // About an hour.
    assert.ok(Math.abs(expiresAt.getTime() - Date.now() - 3_600_000) < 5_000);
  });

  test("expired tokens are refused", () => {
    const { token } = signPreviewToken({ siteId: "s1", entryId: "e1" }, { ttlSeconds: 60 });
    assert.deepEqual(verifyPreviewToken(token, Date.now() + 61_000), {
      ok: false,
      reason: "expired",
    });
  });

  test("tampered and garbage tokens are refused", () => {
    const { token } = signPreviewToken({ siteId: "s1", entryId: "e1" });
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ s: "s2", e: "e1", x: 9e9 })).toString("base64url")}.${signature}`;
    for (const bad of [forged, `${token}x`, "not-a-token", "a.b.c", "", token.split(".")[0]]) {
      assert.deepEqual(verifyPreviewToken(bad), { ok: false, reason: "invalid" }, bad);
    }
  });
});

describe("preview address", () => {
  test("validation", () => {
    assert.equal(previewUrlSchema.parse(""), null);
    assert.equal(
      previewUrlSchema.parse(" https://blog.example/api/preview#x "),
      "https://blog.example/api/preview",
    );
    assert.equal(
      previewUrlSchema.parse("http://localhost:3000/api/preview"),
      "http://localhost:3000/api/preview",
    );
    for (const bad of [
      "blog.example",
      "http://blog.example/p",
      "ftp://blog.example",
      "https://u:p@blog.example",
    ]) {
      assert.equal(previewUrlSchema.safeParse(bad).success, false, bad);
    }
  });

  test("links keep existing query parameters", () => {
    const link = new URL(
      buildPreviewLink("https://blog.example/api/preview?secret=abc", {
        token: "t.k",
        type: "post",
        slug: "hello",
        path: "/posts/hello",
      }),
    );
    assert.equal(link.searchParams.get("secret"), "abc");
    assert.equal(link.searchParams.get("token"), "t.k");
    assert.equal(link.searchParams.get("path"), "/posts/hello");
  });

  test("owners and admins set it; others can't", async () => {
    await assert.rejects(
      setPreviewUrl(db, "author", siteId, "https://blog.example/api/preview"),
      NotAllowedError,
    );
    await assert.rejects(
      setPreviewUrl(db, "stranger", siteId, "https://blog.example/api/preview"),
      NotAllowedError,
    );
    await setPreviewUrl(db, "admin", siteId, "https://blog.example/api/preview");
    assert.equal(await getPreviewUrl(db, "viewer", siteId), "https://blog.example/api/preview");
  });
});

describe("previewing drafts", () => {
  test("any member gets a link; non-members and other sites' entries don't", async () => {
    const link = await createPreviewLink(db, "viewer", siteId, draftId);
    assert.ok(link);
    const url = new URL(link.url);
    assert.equal(url.origin + url.pathname, "https://blog.example/api/preview");
    assert.equal(url.searchParams.get("type"), "post");
    assert.equal(url.searchParams.get("slug"), "secret-draft");
    assert.equal(url.searchParams.get("path"), "/posts/secret-draft");
    await assert.rejects(createPreviewLink(db, "stranger", siteId, draftId), NotAllowedError);
    await assert.rejects(createPreviewLink(db, "stranger", otherSiteId, draftId), NotAllowedError);
  });

  test("the API returns the draft only with a valid token for the key's site", async () => {
    const site = (await getDeliverySite(db, siteId))!;
    const other = (await getDeliverySite(db, otherSiteId))!;
    assert.equal(await getPublishedEntry(db, site, "post", "secret-draft"), null);

    const link = await createPreviewLink(db, "owner", siteId, draftId);
    const token = new URL(link!.url).searchParams.get("token")!;
    const result = await getPreviewEntry(db, site, token);
    assert.ok(result.ok);
    assert.equal(result.entry.title, "Secret draft");
    assert.equal(result.entry.status, "draft");
    assert.match(result.entry.body.html, /Not live yet\./);
    assert.ok(result.entry.preview.expiresAt);

    assert.deepEqual(await getPreviewEntry(db, other, token), { ok: false, reason: "wrong_site" });
    assert.deepEqual(await getPreviewEntry(db, site, "garbage"), { ok: false, reason: "invalid" });
    const expired = signPreviewToken({ siteId, entryId: draftId }, { ttlSeconds: -1 }).token;
    assert.deepEqual(await getPreviewEntry(db, site, expired), { ok: false, reason: "expired" });
    const missing = signPreviewToken({ siteId, entryId: "nope" }).token;
    assert.deepEqual(await getPreviewEntry(db, site, missing), { ok: false, reason: "not_found" });
  });

  test("without a preview address, Klipt's built-in preview is used", async () => {
    await setPreviewUrl(db, "owner", siteId, "");
    assert.equal(await createPreviewLink(db, "owner", siteId, draftId), null);
  });
});
