import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import {
  AccountError,
  changeEmail,
  deleteAccount,
  EmailTakenError,
  listOwnedSites,
  listSessions,
  OwnsSitesError,
  revokeOtherSessions,
  revokeSession,
  updateName,
} from "@/server/account";
import { createApiKey } from "@/server/api-keys";
import { createEntry } from "@/server/content";
import { createPgliteDatabase, type Database } from "@/server/db";
import {
  apiKeys,
  contentEntries,
  sessions,
  siteMembers,
  siteOwnershipTransfers,
  users,
} from "@/server/db/schema";
import { acceptTransfer, startTransfer, transferLinkToken } from "@/server/ownership";
import { archiveSite } from "@/server/site-settings";
import { createSite } from "@/server/sites";
import { describeDevice, emailSchema } from "@/lib/account";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-account-0123456789abcdef";
process.env.BETTER_AUTH_URL = "https://cms.example";

let db: Database;
let siteId: string;
const user = (id: string) => ({ id, email: `${id}@test.local` });

async function addSession(id: string, userId: string, updatedAt: Date, expiresInMs = 3_600_000) {
  await db.insert(sessions).values({
    id,
    userId,
    token: `token-${id}`,
    expiresAt: new Date(Date.now() + expiresInMs),
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    ipAddress: "203.0.113.7",
    updatedAt,
  });
}

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of ["owner", "admin", "editor", "heir", "solo", "other"]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Blog", domain: "blog.example" })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
  ]);
});

describe("profile", () => {
  test("updates the name", async () => {
    await updateName(db, "other", "Ada Lovelace");
    const [row] = await db.select().from(users).where(eq(users.id, "other"));
    assert.equal(row.name, "Ada Lovelace");
  });

  test("changes the email, lowercased and unverified", async () => {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, "other"));
    assert.equal(await changeEmail(db, "other", "  Ada@Example.COM "), "ada@example.com");
    const [row] = await db.select().from(users).where(eq(users.id, "other"));
    assert.equal(row.email, "ada@example.com");
    assert.equal(row.emailVerified, false);
  });

  test("refuses an email another account uses, in any case", async () => {
    await assert.rejects(changeEmail(db, "other", "EDITOR@test.local"), EmailTakenError);
    const [row] = await db.select().from(users).where(eq(users.id, "other"));
    assert.equal(row.email, "ada@example.com");
  });

  test("email rules", () => {
    assert.equal(emailSchema.parse(" A@B.co "), "a@b.co");
    assert.equal(emailSchema.safeParse("not-an-email").success, false);
  });
});

describe("sessions", () => {
  test("lists active sessions with this device first and no tokens", async () => {
    await addSession("s-old", "editor", new Date(Date.now() - 86_400_000));
    await addSession("s-new", "editor", new Date());
    await addSession("s-expired", "editor", new Date(), -1000);
    await addSession("s-other-user", "admin", new Date());
    const list = await listSessions(db, "editor", "s-old");
    assert.deepEqual(
      list.map((s) => [s.id, s.current]),
      [
        ["s-old", true],
        ["s-new", false],
      ],
    );
    assert.equal(list[0].device, "Chrome on macOS");
    assert.equal(list[0].ipAddress, "203.0.113.7");
    assert.ok(!("token" in list[0]));
  });

  test("revokes only the user's own other sessions", async () => {
    assert.equal(await revokeSession(db, "editor", "s-other-user", "s-old"), false);
    await assert.rejects(revokeSession(db, "editor", "s-old", "s-old"), AccountError);
    assert.equal(await revokeSession(db, "editor", "s-new", "s-old"), true);
    const left = await db.select({ id: sessions.id }).from(sessions);
    assert.deepEqual(left.map((s) => s.id).sort(), ["s-expired", "s-old", "s-other-user"]);
  });

  test("signs out every other device", async () => {
    await addSession("s-a", "editor", new Date());
    await addSession("s-b", "editor", new Date());
    assert.equal(await revokeOtherSessions(db, "editor", "s-old"), 3);
    const left = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, "editor"));
    assert.deepEqual(
      left.map((s) => s.id),
      ["s-old"],
    );
  });

  test("describes devices from the user agent", () => {
    assert.equal(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
      "Safari on iOS",
    );
    assert.equal(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
      "Edge on Windows",
    );
    assert.equal(describeDevice(null), "Unknown device");
  });
});

describe("deleting an account", () => {
  test("is refused while the user owns a site, archived ones included", async () => {
    await assert.rejects(deleteAccount(db, "owner", "owner@test.local"), (error) => {
      assert.ok(error instanceof OwnsSitesError);
      assert.deepEqual(
        error.sites.map((s) => [s.name, s.archived]),
        [["Blog", false]],
      );
      return true;
    });

    const soloSite = (await createSite(db, "solo", { name: "Notes", domain: null })).id;
    await archiveSite(db, "solo", soloSite);
    assert.deepEqual(await listOwnedSites(db, "solo"), [
      { id: soloSite, name: "Notes", archived: true },
    ]);
    await assert.rejects(deleteAccount(db, "solo", "solo@test.local"), OwnsSitesError);
  });

  test("needs the email typed exactly", async () => {
    await assert.rejects(deleteAccount(db, "editor", "someone@test.local"), AccountError);
    const [row] = await db.select().from(users).where(eq(users.id, "editor"));
    assert.ok(row);
  });

  test("keeps content and keys on the site with the creator cleared", async () => {
    const entry = await createEntry(db, "editor", siteId, "post", "Kept post");
    const key = await createApiKey(db, "admin", siteId, "Website");
    await addSession("s-admin", "admin", new Date());

    await deleteAccount(db, "editor", " EDITOR@test.local ");
    await deleteAccount(db, "admin", "admin@test.local");

    const [post] = await db.select().from(contentEntries).where(eq(contentEntries.id, entry.id));
    assert.equal(post.title, "Kept post");
    assert.equal(post.authorId, null);
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.id));
    assert.equal(apiKey.createdById, null);
    const members = await db.select().from(siteMembers).where(eq(siteMembers.siteId, siteId));
    assert.deepEqual(
      members.map((m) => m.userId),
      ["owner"],
    );
    const left = await db.select().from(sessions).where(eq(sessions.userId, "admin"));
    assert.equal(left.length, 0);
  });

  test("works for a former owner, keeping the site's transfer history", async () => {
    await startTransfer(db, user("owner"), siteId, {
      email: "heir@test.local",
      previousOwnerRetainsAdmin: false,
    });
    const token = await transferLinkToken(db, "owner", siteId);
    await acceptTransfer(db, user("heir"), token);

    await deleteAccount(db, "owner", "owner@test.local");
    const [transfer] = await db
      .select()
      .from(siteOwnershipTransfers)
      .where(eq(siteOwnershipTransfers.siteId, siteId));
    assert.equal(transfer.status, "accepted");
    assert.equal(transfer.fromUserId, null);
    assert.equal(transfer.recipientUserId, "heir");
    assert.deepEqual(
      (await listOwnedSites(db, "heir")).map((s) => s.name),
      ["Blog"],
    );
  });
});
