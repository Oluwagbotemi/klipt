import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { createPgliteDatabase, type Database } from "@/server/db";
import { siteInvitations, siteMembers, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { createSite, getSiteRole } from "@/server/sites";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  getInvitationToken,
  listTeam,
  previewInvitation,
  removeMember,
  renewInvitation,
  revokeInvitation,
  TeamError,
} from "@/server/team";
import { assignableRoles, canManageMember } from "@/lib/team";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-team-0123456789abcdef";

let db: Database;
let siteId: string;
const user = (id: string) => ({ id, email: `${id}@test.local` });

before(async () => {
  db = await createPgliteDatabase("memory://", { migrate: true });
  for (const id of [
    "owner",
    "admin",
    "admin2",
    "editor",
    "viewer",
    "newbie",
    "other",
    "stranger",
  ]) {
    await db.insert(users).values({ id, name: `User ${id}`, email: `${id}@test.local` });
  }
  siteId = (await createSite(db, "owner", { name: "Team site", domain: null })).id;
  await db.insert(siteMembers).values([
    { siteId, userId: "admin", role: "admin" },
    { siteId, userId: "admin2", role: "admin" },
    { siteId, userId: "editor", role: "editor" },
    { siteId, userId: "viewer", role: "viewer" },
  ]);
});

describe("rules", () => {
  test("who can assign which roles", () => {
    assert.deepEqual(assignableRoles("owner"), ["admin", "editor", "author", "viewer"]);
    assert.deepEqual(assignableRoles("admin"), ["editor", "author", "viewer"]);
    assert.deepEqual(assignableRoles("editor"), []);
  });

  test("who can manage whom", () => {
    const owner = { role: "owner" as const, userId: "o" };
    const admin = { role: "admin" as const, userId: "a" };
    assert.equal(canManageMember(owner, { role: "admin", userId: "a" }), true);
    assert.equal(canManageMember(admin, { role: "admin", userId: "a2" }), false);
    assert.equal(canManageMember(admin, { role: "editor", userId: "e" }), true);
    assert.equal(canManageMember(admin, { role: "owner", userId: "o" }), false);
    assert.equal(canManageMember(admin, admin), false);
  });
});

describe("invitations", () => {
  test("invite, preview, accept with the matching email", async () => {
    const { token } = await createInvitation(db, "admin", siteId, {
      email: " Newbie@Test.Local ",
      role: "editor",
    });
    const preview = await previewInvitation(db, token);
    assert.equal(preview.state, "open");
    assert.ok(preview.state === "open" && preview.email === "newbie@test.local");
    assert.ok(preview.state === "open" && preview.invitedByName === "User admin");

    await assert.rejects(acceptInvitation(db, user("other"), token), /is for newbie@test\.local/);
    assert.deepEqual(await acceptInvitation(db, user("newbie"), token), {
      siteId,
      alreadyMember: false,
    });
    assert.equal(await getSiteRole(db, "newbie", siteId), "editor");
    assert.equal((await previewInvitation(db, token)).state, "accepted");
    await assert.rejects(acceptInvitation(db, user("newbie"), token), TeamError);
  });

  test("validation and duplicates", async () => {
    await assert.rejects(createInvitation(db, "owner", siteId, { email: "nope", role: "editor" }));
    await assert.rejects(
      createInvitation(db, "owner", siteId, { email: "editor@test.local", role: "viewer" }),
      /already a member/,
    );
    await createInvitation(db, "owner", siteId, { email: "dup@test.local", role: "viewer" });
    await assert.rejects(
      createInvitation(db, "owner", siteId, { email: "dup@test.local", role: "viewer" }),
      /already has an invitation/,
    );
  });

  test("only allowed roles, only managers", async () => {
    await assert.rejects(
      createInvitation(db, "admin", siteId, { email: "a@test.local", role: "admin" }),
      NotAllowedError,
    );
    await assert.rejects(
      createInvitation(db, "editor", siteId, { email: "a@test.local", role: "viewer" }),
      NotAllowedError,
    );
    await assert.rejects(
      createInvitation(db, "owner", siteId, { email: "a@test.local", role: "owner" }),
    );
    const team = await listTeam(db, "viewer", siteId);
    assert.equal(team.invitations, null);
    assert.ok(team.members.length >= 5);
    assert.equal(team.members[0].role, "owner");
  });

  test("copy, renew and cancel links", async () => {
    const { id, token } = await createInvitation(db, "owner", siteId, {
      email: "link@test.local",
      role: "author",
    });
    assert.equal(await getInvitationToken(db, "owner", siteId, id), token);
    const renewed = await renewInvitation(db, "owner", siteId, id);
    assert.notEqual(renewed, token);
    assert.equal((await previewInvitation(db, token)).state, "invalid");
    assert.equal((await previewInvitation(db, renewed)).state, "open");
    await revokeInvitation(db, "admin", siteId, id);
    assert.equal((await previewInvitation(db, renewed)).state, "invalid");
    await assert.rejects(revokeInvitation(db, "owner", siteId, id), NotAllowedError);
  });

  test("expired invitations can't be accepted and can be replaced", async () => {
    const { id, token } = await createInvitation(db, "owner", siteId, {
      email: "late@test.local",
      role: "viewer",
    });
    await db
      .update(siteInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(siteInvitations.id, id));
    assert.equal((await previewInvitation(db, token)).state, "expired");
    await assert.rejects(acceptInvitation(db, { id: "x", email: "late@test.local" }, token));
    const again = await createInvitation(db, "owner", siteId, {
      email: "late@test.local",
      role: "viewer",
    });
    assert.equal((await previewInvitation(db, again.token)).state, "open");
  });

  test("unknown tokens reveal nothing", async () => {
    assert.deepEqual(await previewInvitation(db, "not-a-real-token-at-all-123456"), {
      state: "invalid",
    });
    assert.deepEqual(await previewInvitation(db, "../../x"), { state: "invalid" });
  });
});

describe("members", () => {
  test("role changes follow the rules", async () => {
    await changeMemberRole(db, "admin", siteId, "viewer", "author");
    assert.equal(await getSiteRole(db, "viewer", siteId), "author");
    await assert.rejects(changeMemberRole(db, "admin", siteId, "viewer", "admin"), NotAllowedError);
    await assert.rejects(
      changeMemberRole(db, "admin", siteId, "admin2", "editor"),
      NotAllowedError,
    );
    await assert.rejects(changeMemberRole(db, "admin", siteId, "owner", "editor"), NotAllowedError);
    await assert.rejects(changeMemberRole(db, "admin", siteId, "admin", "editor"), NotAllowedError);
    await changeMemberRole(db, "owner", siteId, "admin2", "editor");
    assert.equal(await getSiteRole(db, "admin2", siteId), "editor");
  });

  test("removing members and leaving", async () => {
    await assert.rejects(removeMember(db, "editor", siteId, "viewer"), NotAllowedError);
    await removeMember(db, "admin", siteId, "viewer");
    assert.equal(await getSiteRole(db, "viewer", siteId), null);
    await removeMember(db, "admin2", siteId, "admin2");
    assert.equal(await getSiteRole(db, "admin2", siteId), null);
    await assert.rejects(removeMember(db, "owner", siteId, "owner"), /transfer ownership/);
    await assert.rejects(removeMember(db, "stranger", siteId, "editor"), NotAllowedError);
  });
});
