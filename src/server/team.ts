import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { clearAssignments } from "@/server/assignments";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import { auditEvents, siteInvitations, siteMembers, sites, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/secrets";
import { getSiteRole } from "@/server/sites";
import { can } from "@/lib/permissions";
import {
  assignableRoles,
  canManageMember,
  INVITATION_DAYS,
  invitationSchema,
  MAX_OPEN_INVITATIONS,
  type InvitableRole,
  type Team,
} from "@/lib/team";
import type { SiteRole } from "@/lib/types";

/*
 * Site members and invitations. Management functions take an explicit
 * userId and check the rules in src/lib/team.ts. Invitations are links with a
 * random token; only the token's hash is used for lookup.
 */

export class TeamError extends Error {}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const open = and(isNull(siteInvitations.acceptedAt), isNull(siteInvitations.revokedAt));

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  return role;
}

async function audit(
  db: DbOrTx,
  siteId: string,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(auditEvents).values({ siteId, actorId, action, targetType, targetId, metadata });
}

export async function listTeam(db: DbOrTx, userId: string, siteId: string): Promise<Team> {
  const role = await requireRole(db, userId, siteId);
  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: siteMembers.role,
      joinedAt: siteMembers.createdAt,
    })
    .from(siteMembers)
    .innerJoin(users, eq(users.id, siteMembers.userId))
    .where(eq(siteMembers.siteId, siteId))
    .orderBy(
      sql`array_position(array['owner','admin','editor','author','viewer']::site_role[], ${siteMembers.role})`,
      asc(users.name),
    );

  let invitations: Team["invitations"] = null;
  if (can(role, "members.manage")) {
    const now = new Date();
    const inviter = users;
    const rows = await db
      .select({
        id: siteInvitations.id,
        email: siteInvitations.email,
        role: siteInvitations.role,
        invitedByName: inviter.name,
        createdAt: siteInvitations.createdAt,
        expiresAt: siteInvitations.expiresAt,
      })
      .from(siteInvitations)
      .leftJoin(inviter, eq(inviter.id, siteInvitations.invitedById))
      .where(and(eq(siteInvitations.siteId, siteId), open))
      .orderBy(desc(siteInvitations.createdAt));
    invitations = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      expired: row.expiresAt <= now,
    }));
  }

  return {
    members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
    invitations,
  };
}

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
    tokenEncrypted: encryptSecret(token),
    expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
  };
}

/** Invites someone by email. Returns the token for the invitation link. */
export async function createInvitation(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: { email: string; role: string },
): Promise<{ id: string; token: string }> {
  const { email, role } = invitationSchema.parse(input);
  return db.transaction(async (tx) => {
    const actorRole = await requireRole(tx, userId, siteId);
    if (!(assignableRoles(actorRole) as string[]).includes(role)) {
      throw new NotAllowedError("Can't invite with that role.");
    }
    const [member] = await tx
      .select({ userId: users.id })
      .from(siteMembers)
      .innerJoin(users, eq(users.id, siteMembers.userId))
      .where(and(eq(siteMembers.siteId, siteId), sql`lower(${users.email}) = ${email}`))
      .limit(1);
    if (member) throw new TeamError(`${email} is already a member of this site.`);

    // An expired invitation is replaced; a live one must be renewed or cancelled instead.
    const [existing] = await tx
      .select({ id: siteInvitations.id, expiresAt: siteInvitations.expiresAt })
      .from(siteInvitations)
      .where(and(eq(siteInvitations.siteId, siteId), eq(siteInvitations.email, email), open))
      .limit(1);
    if (existing && existing.expiresAt > new Date()) {
      throw new TeamError(`${email} already has an invitation. Copy its link or cancel it below.`);
    }
    if (existing) {
      await tx
        .update(siteInvitations)
        .set({ revokedAt: new Date() })
        .where(eq(siteInvitations.id, existing.id));
    }

    const [{ total }] = await tx
      .select({ total: count() })
      .from(siteInvitations)
      .where(and(eq(siteInvitations.siteId, siteId), open));
    if (total >= MAX_OPEN_INVITATIONS) {
      throw new TeamError(`A site can have up to ${MAX_OPEN_INVITATIONS} open invitations.`);
    }

    const { token, ...secret } = newToken();
    try {
      const [invitation] = await tx
        .insert(siteInvitations)
        .values({ siteId, email, role, invitedById: userId, ...secret })
        .returning({ id: siteInvitations.id });
      await audit(tx, siteId, userId, "member.invited", "invitation", invitation.id, {
        email,
        role,
      });
      return { id: invitation.id, token };
    } catch (error) {
      if (isUniqueViolation(error, "site_invitations_one_open")) {
        throw new TeamError(`${email} already has an invitation.`);
      }
      throw error;
    }
  });
}

async function manageableInvitation(
  db: DbOrTx,
  userId: string,
  siteId: string,
  invitationId: string,
) {
  const actorRole = await requireRole(db, userId, siteId);
  const [invitation] = await db
    .select()
    .from(siteInvitations)
    .where(and(eq(siteInvitations.siteId, siteId), eq(siteInvitations.id, invitationId), open))
    .limit(1);
  if (!invitation) throw new NotAllowedError("Invitation not found.");
  if (!(assignableRoles(actorRole) as string[]).includes(invitation.role)) {
    throw new NotAllowedError("Can't manage this invitation.");
  }
  return invitation;
}

/** The current link token of an open invitation, for copying again. */
export async function getInvitationToken(
  db: DbOrTx,
  userId: string,
  siteId: string,
  invitationId: string,
): Promise<string> {
  const invitation = await manageableInvitation(db, userId, siteId, invitationId);
  if (invitation.expiresAt <= new Date()) {
    throw new TeamError("This invitation has expired. Renew it to get a new link.");
  }
  return decryptSecret(invitation.tokenEncrypted);
}

/** Replaces the link (the old one stops working) and restarts the expiry. */
export async function renewInvitation(
  db: DbOrTx,
  userId: string,
  siteId: string,
  invitationId: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const invitation = await manageableInvitation(tx, userId, siteId, invitationId);
    const { token, ...secret } = newToken();
    await tx
      .update(siteInvitations)
      .set({ ...secret, updatedAt: new Date() })
      .where(eq(siteInvitations.id, invitation.id));
    await audit(tx, siteId, userId, "member.invite_renewed", "invitation", invitation.id, {
      email: invitation.email,
    });
    return token;
  });
}

export async function revokeInvitation(
  db: DbOrTx,
  userId: string,
  siteId: string,
  invitationId: string,
) {
  await db.transaction(async (tx) => {
    const invitation = await manageableInvitation(tx, userId, siteId, invitationId);
    await tx
      .update(siteInvitations)
      .set({ revokedAt: new Date() })
      .where(eq(siteInvitations.id, invitation.id));
    await audit(tx, siteId, userId, "member.invite_cancelled", "invitation", invitation.id, {
      email: invitation.email,
    });
  });
}

async function lockMember(tx: DbOrTx, siteId: string, memberId: string) {
  const [member] = await tx
    .select({ userId: siteMembers.userId, role: siteMembers.role, name: users.name })
    .from(siteMembers)
    .innerJoin(users, eq(users.id, siteMembers.userId))
    .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, memberId)))
    .for("update", { of: siteMembers })
    .limit(1);
  if (!member) throw new NotAllowedError("Member not found.");
  return member;
}

export async function changeMemberRole(
  db: DbOrTx,
  userId: string,
  siteId: string,
  memberId: string,
  role: string,
) {
  await db.transaction(async (tx) => {
    const actorRole = await requireRole(tx, userId, siteId);
    const member = await lockMember(tx, siteId, memberId);
    if (!canManageMember({ role: actorRole, userId }, member)) {
      throw new NotAllowedError("Can't change this member.");
    }
    if (!(assignableRoles(actorRole) as string[]).includes(role)) {
      throw new NotAllowedError("Can't give that role.");
    }
    if (member.role === role) return;
    await tx
      .update(siteMembers)
      .set({ role: role as InvitableRole, updatedAt: new Date() })
      .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, memberId)));
    await audit(tx, siteId, userId, "member.role_changed", "member", memberId, {
      name: member.name,
      from: member.role,
      to: role,
    });
    if (!can(role as InvitableRole, "content.create")) {
      await clearAssignments(tx, siteId, memberId, userId, member.name);
    }
  });
}

/** Removes a member, or lets a member (not the owner) leave when memberId is themselves. */
export async function removeMember(db: DbOrTx, userId: string, siteId: string, memberId: string) {
  await db.transaction(async (tx) => {
    const actorRole = await requireRole(tx, userId, siteId);
    const member = await lockMember(tx, siteId, memberId);
    const leaving = memberId === userId;
    if (leaving ? member.role === "owner" : !canManageMember({ role: actorRole, userId }, member)) {
      throw new NotAllowedError(
        leaving ? "The owner can't leave; transfer ownership first." : "Can't remove this member.",
      );
    }
    await tx
      .delete(siteMembers)
      .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, memberId)));
    await audit(
      tx,
      siteId,
      userId,
      leaving ? "member.left" : "member.removed",
      "member",
      memberId,
      { name: member.name, role: member.role },
    );
    await clearAssignments(tx, siteId, memberId, userId, member.name);
  });
}

// ---------------------------------------------------------------------------
// Accepting (the invitee; no membership needed yet)
// ---------------------------------------------------------------------------

export type InvitationPreview =
  | { state: "invalid" }
  | { state: "expired" | "accepted"; siteName: string }
  | {
      state: "open";
      siteId: string;
      siteName: string;
      email: string;
      role: SiteRole;
      invitedByName: string | null;
      expiresAt: string;
    };

/** What an invitation link shows, without revealing anything for unknown tokens. */
export async function previewInvitation(db: DbOrTx, token: string): Promise<InvitationPreview> {
  if (!/^[\w-]{20,100}$/.test(token)) return { state: "invalid" };
  const [row] = await db
    .select({
      invitation: siteInvitations,
      siteName: sites.name,
      archivedAt: sites.archivedAt,
      invitedByName: users.name,
    })
    .from(siteInvitations)
    .innerJoin(sites, eq(sites.id, siteInvitations.siteId))
    .leftJoin(users, eq(users.id, siteInvitations.invitedById))
    .where(eq(siteInvitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.invitation.revokedAt || row.archivedAt) return { state: "invalid" };
  if (row.invitation.acceptedAt) return { state: "accepted", siteName: row.siteName };
  if (row.invitation.expiresAt <= new Date()) return { state: "expired", siteName: row.siteName };
  return {
    state: "open",
    siteId: row.invitation.siteId,
    siteName: row.siteName,
    email: row.invitation.email,
    role: row.invitation.role,
    invitedByName: row.invitedByName,
    expiresAt: row.invitation.expiresAt.toISOString(),
  };
}

/** Joins the site. The signed-in account's email must match the invitation. */
export async function acceptInvitation(
  db: DbOrTx,
  user: { id: string; email: string },
  token: string,
): Promise<{ siteId: string; alreadyMember: boolean }> {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(siteInvitations)
      .where(
        and(
          eq(siteInvitations.tokenHash, hashToken(token)),
          open,
          gt(siteInvitations.expiresAt, new Date()),
        ),
      )
      .for("update")
      .limit(1);
    if (!invitation) throw new TeamError("This invitation is no longer valid. Ask for a new link.");
    if (invitation.email !== user.email.trim().toLowerCase()) {
      throw new TeamError(
        `This invitation is for ${invitation.email}. Sign in with that email to accept it.`,
      );
    }

    const existing = await getSiteRole(tx, user.id, invitation.siteId);
    if (!existing) {
      await tx.insert(siteMembers).values({
        siteId: invitation.siteId,
        userId: user.id,
        role: invitation.role,
      });
    }
    await tx
      .update(siteInvitations)
      .set({ acceptedAt: new Date(), acceptedById: user.id })
      .where(eq(siteInvitations.id, invitation.id));
    if (!existing) {
      await audit(tx, invitation.siteId, user.id, "member.joined", "member", user.id, {
        role: invitation.role,
      });
    }
    return { siteId: invitation.siteId, alreadyMember: Boolean(existing) };
  });
}
