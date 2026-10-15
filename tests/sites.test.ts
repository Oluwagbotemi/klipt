import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import {
  auditEvents,
  contentModels,
  siteMembers,
  siteOwnershipTransfers,
  users,
} from "@/server/db/schema";
import {
  createSite,
  DomainTakenError,
  getSiteForUser,
  getSiteRole,
  listSitesForUser,
} from "@/server/sites";
import { createSiteSchema } from "@/lib/validation/site";

let db: Database;

async function addUser(id: string) {
  await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  return id;
}

function parse(input: { name: string; domain: string }) {
  return createSiteSchema.parse(input);
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  await Promise.all(["alice", "bob", "carol"].map(addUser));
});

describe("createSite", () => {
  test("makes the creator the owner, adds system models and an audit event", async () => {
    const { id } = await createSite(db, "alice", parse({ name: "Alpha", domain: "" }));

    assert.equal(await getSiteRole(db, "alice", id), "owner");
    const models = await db.select().from(contentModels).where(eq(contentModels.siteId, id));
    assert.deepEqual(models.map((m) => m.key).sort(), ["page", "post"]);
    assert.ok(models.every((m) => m.isSystem));
    const events = await db.select().from(auditEvents).where(eq(auditEvents.siteId, id));
    assert.deepEqual(
      events.map((e) => [e.action, e.actorId]),
      [["site.created", "alice"]],
    );
  });

  test("rejects a domain already used by another site", async () => {
    await createSite(db, "alice", parse({ name: "Beta", domain: "https://Beta.example/" }));
    await assert.rejects(
      createSite(db, "bob", parse({ name: "Copy", domain: "beta.example" })),
      DomainTakenError,
    );
  });
});

describe("site access is scoped to membership", () => {
  test("non-members can't list or read a site", async () => {
    const { id } = await createSite(db, "alice", parse({ name: "Private", domain: "" }));

    assert.ok((await listSitesForUser(db, "alice")).some((s) => s.id === id));
    assert.ok(!(await listSitesForUser(db, "bob")).some((s) => s.id === id));
    assert.equal(await getSiteForUser(db, "bob", id), null);
    assert.equal(await getSiteRole(db, "bob", id), null);
  });

  test("members see their own role and the owner", async () => {
    const { id } = await createSite(db, "alice", parse({ name: "Shared", domain: "" }));
    await db.insert(siteMembers).values({ siteId: id, userId: "bob", role: "editor" });

    const site = await getSiteForUser(db, "bob", id);
    assert.equal(site?.currentUserRole, "editor");
    assert.equal(site?.owner.id, "alice");
  });
});

describe("ownership invariants", () => {
  test("a site can't have two owners", async () => {
    const { id } = await createSite(db, "alice", parse({ name: "One owner", domain: "" }));
    await assert.rejects(
      db.insert(siteMembers).values({ siteId: id, userId: "bob", role: "owner" }),
    );
  });

  test("a site can't have two pending transfers", async () => {
    const { id } = await createSite(db, "alice", parse({ name: "Transfers", domain: "" }));
    const transfer = {
      siteId: id,
      fromUserId: "alice",
      recipientEmail: "client@test.local",
      tokenHash: "x",
      expiresAt: new Date(Date.now() + 60_000),
    };
    await db.insert(siteOwnershipTransfers).values(transfer);
    await assert.rejects(db.insert(siteOwnershipTransfers).values({ ...transfer, tokenHash: "y" }));
    // Finished transfers don't block a new one.
    await db
      .update(siteOwnershipTransfers)
      .set({ status: "cancelled" })
      .where(eq(siteOwnershipTransfers.siteId, id));
    await db.insert(siteOwnershipTransfers).values({ ...transfer, tokenHash: "z" });
  });

  test("only owners and admins see a pending transfer's recipient", async () => {
    const { id } = await createSite(db, "alice", parse({ name: "Handoff", domain: "" }));
    await db.insert(siteMembers).values([
      { siteId: id, userId: "bob", role: "admin" },
      { siteId: id, userId: "carol", role: "editor" },
    ]);
    await db.insert(siteOwnershipTransfers).values({
      siteId: id,
      fromUserId: "alice",
      recipientEmail: "client@test.local",
      tokenHash: "t",
      expiresAt: new Date(Date.now() + 60_000),
    });

    assert.equal(
      (await getSiteForUser(db, "alice", id))?.pendingTransfer?.recipientEmail,
      "client@test.local",
    );
    assert.ok((await getSiteForUser(db, "bob", id))?.pendingTransfer);
    assert.equal((await getSiteForUser(db, "carol", id))?.pendingTransfer, null);
  });
});
