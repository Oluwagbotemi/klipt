import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { contentModels, siteMembers, sites, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import {
  applyBuildingPreset,
  finishOnboarding,
  getOnboardingState,
  saveOnboardingAnswers,
} from "@/server/onboarding";
import { getDefaultModelKey } from "@/server/publishing";
import { createSite } from "@/server/sites";
import { acceptInvitation, createInvitation } from "@/server/team";
import {
  BUILDING_KEYS,
  needsOnboarding,
  parseStep,
  quickActionOrder,
  stepsFor,
} from "@/lib/onboarding";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-onboarding-tests-0123456789";

let db: Database;

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["new", "veteran", "invitee", "editor", "stranger", "skipper"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  await createSite(db, "veteran", { name: "Old site", domain: null });
});

const keysOf = async (siteId: string) =>
  (
    await db
      .select({ key: contentModels.key, fields: contentModels.fields })
      .from(contentModels)
      .where(eq(contentModels.siteId, siteId))
  ).sort((a, b) => a.key.localeCompare(b.key));

describe("who sees the welcome flow", () => {
  test("someone new with no sites does; someone with sites doesn't", async () => {
    assert.equal(needsOnboarding(await getOnboardingState(db, "new")), true);
    const veteran = await getOnboardingState(db, "veteran");
    assert.equal(veteran.siteCount, 1);
    assert.equal(needsOnboarding(veteran), false);
  });

  test("skipping (or finishing) marks it done for good, keeping the first time", async () => {
    await finishOnboarding(db, "skipper");
    const first = (await getOnboardingState(db, "skipper")).onboardedAt;
    assert.ok(first);
    await finishOnboarding(db, "skipper");
    assert.equal((await getOnboardingState(db, "skipper")).onboardedAt, first);
    assert.equal(needsOnboarding(await getOnboardingState(db, "skipper")), false);
  });

  test("people who joined through an invitation only answer the role", async () => {
    assert.deepEqual(stepsFor(true), ["role"]);
    assert.equal(parseStep("site", true), "role");
    assert.equal(parseStep("connect", false), "connect");
    assert.equal(parseStep("nonsense", false), "role");

    const siteId = (await createSite(db, "veteran", { name: "Team site", domain: null })).id;
    const invite = await createInvitation(db, "veteran", siteId, {
      email: "invitee@test.local",
      role: "editor",
    });
    const before = await getOnboardingState(db, "invitee");
    assert.equal(needsOnboarding(before), true);
    await acceptInvitation(db, { id: "invitee", email: "invitee@test.local" }, invite.token);
    // After joining they have a site, so /sites never sends them to /welcome.
    assert.equal(needsOnboarding(await getOnboardingState(db, "invitee")), false);
  });
});

describe("answers", () => {
  test("role and building are saved, and refused when unknown", async () => {
    await saveOnboardingAnswers(db, "new", { role: "developer" });
    await saveOnboardingAnswers(db, "new", { building: "docs" });
    const state = await getOnboardingState(db, "new");
    assert.equal(state.role, "developer");
    assert.equal(state.building, "docs");
    await assert.rejects(() => saveOnboardingAnswers(db, "new", { role: "admin" }));
    await assert.rejects(() => saveOnboardingAnswers(db, "new", { building: "<script>" }));
  });

  test("the role only reorders Overview quick actions", () => {
    assert.equal(quickActionOrder("developer")[0], "connect");
    assert.equal(quickActionOrder("writer")[0], "post");
    assert.equal(quickActionOrder(null)[0], "post");
    for (const role of ["writer", "developer", "agency", null] as const) {
      assert.deepEqual([...quickActionOrder(role)].sort(), ["connect", "media", "page", "post"]);
    }
  });
});

describe("building presets", () => {
  const site = async (building: (typeof BUILDING_KEYS)[number]) => {
    const id = (await createSite(db, "new", { name: `Site ${building}`, domain: null })).id;
    await applyBuildingPreset(db, "new", id, building);
    return id;
  };

  test("blog keeps Posts as the default and adds nothing", async () => {
    const id = await site("blog");
    assert.deepEqual(
      (await keysOf(id)).map((m) => m.key),
      ["page", "post"],
    );
    assert.equal(await getDefaultModelKey(db, id), "post");
  });

  test("company website makes Pages the default", async () => {
    const id = await site("company");
    assert.equal(await getDefaultModelKey(db, id), "page");
  });

  test("docs adds a Docs type at /docs/… and makes it the default", async () => {
    const id = await site("docs");
    const docs = (await keysOf(id)).find((m) => m.key === "docs");
    assert.ok(docs);
    assert.deepEqual(
      docs.fields.map((f) => f.key),
      ["summary"],
    );
    assert.equal(await getDefaultModelKey(db, id), "docs");
  });

  test("store adds Products with price and image, and keeps Posts as the default", async () => {
    const id = await site("store");
    const products = (await keysOf(id)).find((m) => m.key === "products");
    assert.ok(products);
    assert.deepEqual(
      products.fields.map((f) => [f.key, f.type]),
      [
        ["price", "number"],
        ["image", "media"],
      ],
    );
    assert.equal(await getDefaultModelKey(db, id), "post");
  });

  test("applying twice doesn't duplicate anything", async () => {
    const id = await site("store");
    await applyBuildingPreset(db, "new", id, "store");
    assert.equal((await keysOf(id)).filter((m) => m.key === "products").length, 1);
  });

  test("only the site's owner can apply a preset", async () => {
    const id = (await createSite(db, "veteran", { name: "Guarded", domain: null })).id;
    await db.insert(siteMembers).values({ siteId: id, userId: "editor", role: "editor" });
    await assert.rejects(() => applyBuildingPreset(db, "editor", id, "docs"), NotAllowedError);
    await assert.rejects(() => applyBuildingPreset(db, "stranger", id, "docs"), NotAllowedError);
    assert.equal(
      (
        await db
          .select({ id: contentModels.id })
          .from(contentModels)
          .where(and(eq(contentModels.siteId, id), eq(contentModels.key, "docs")))
      ).length,
      0,
    );
    const [row] = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, id));
    assert.equal(row.name, "Guarded");
  });
});
