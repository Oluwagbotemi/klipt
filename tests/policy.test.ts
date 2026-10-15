import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { can } from "@/lib/permissions";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSiteSchema, normalizeDomain } from "@/lib/validation/site";

describe("permissions", () => {
  test("only the owner can transfer ownership, delete, or manage billing", () => {
    for (const permission of [
      "site.transfer_ownership",
      "site.delete",
      "billing.manage",
    ] as const) {
      assert.equal(can("owner", permission), true, permission);
      for (const role of ["admin", "editor", "author", "viewer"] as const) {
        assert.equal(can(role, permission), false, `${role} ${permission}`);
      }
    }
  });

  test("authors can create content but not publish it", () => {
    assert.equal(can("author", "content.create"), true);
    assert.equal(can("author", "content.publish"), false);
    assert.equal(can("editor", "content.publish"), true);
  });

  test("viewers can only view", () => {
    assert.equal(can("viewer", "site.view"), true);
    assert.equal(can("viewer", "content.create"), false);
    assert.equal(can("viewer", "seo.manage"), false);
  });
});

describe("site input validation", () => {
  test("normalizes pasted URLs to a bare domain", () => {
    assert.equal(normalizeDomain("  HTTPS://Example.com/about?x=1 "), "example.com");
    assert.equal(normalizeDomain("shop.example.co.uk."), "shop.example.co.uk");
  });

  test("accepts an empty domain and rejects invalid ones", () => {
    assert.equal(createSiteSchema.parse({ name: "Site", domain: "" }).domain, null);
    for (const domain of ["not a domain", "localhost", "-bad.com", "a..com"]) {
      assert.equal(createSiteSchema.safeParse({ name: "Site", domain }).success, false, domain);
    }
  });

  test("requires a 2–80 character name", () => {
    assert.equal(createSiteSchema.safeParse({ name: " a ", domain: "" }).success, false);
    assert.equal(createSiteSchema.safeParse({ name: "x".repeat(81), domain: "" }).success, false);
  });
});

describe("safeRedirectPath", () => {
  test("allows same-origin paths only", () => {
    assert.equal(safeRedirectPath("/sites/abc/seo"), "/sites/abc/seo");
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "", null]) {
      assert.equal(safeRedirectPath(next), "/sites", String(next));
    }
  });
});
