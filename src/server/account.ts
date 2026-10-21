import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import { keepActorName } from "@/server/activity";
import { sessions, siteMembers, sites, users } from "@/server/db/schema";
import { describeDevice, type AccountSession, type OwnedSite } from "@/lib/account";

/*
 * The signed-in user's own account: profile, sessions and deletion. Every
 * function takes the user's id explicitly and touches only that user's rows.
 * Passwords are checked by the caller (Better Auth) before email changes and
 * deletion.
 */

export class AccountError extends Error {}

export class EmailTakenError extends AccountError {
  constructor() {
    super("Another account already uses that email.");
  }
}

export class OwnsSitesError extends AccountError {
  constructor(readonly sites: OwnedSite[]) {
    super("Transfer or delete the sites you own before deleting your account.");
  }
}

export async function updateName(db: DbOrTx, userId: string, name: string) {
  await db.update(users).set({ name }).where(eq(users.id, userId));
}

/**
 * Changes the sign-in email. Klipt doesn't send email yet, so the address is
 * stored unverified; sign-in works with it immediately.
 */
export async function changeEmail(db: DbOrTx, userId: string, newEmail: string) {
  const email = newEmail.trim().toLowerCase();
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, userId)))
    .limit(1);
  if (taken) throw new EmailTakenError();
  try {
    await db.update(users).set({ email, emailVerified: false }).where(eq(users.id, userId));
  } catch (error) {
    if (isUniqueViolation(error, "users_email_unique")) throw new EmailTakenError();
    throw error;
  }
  return email;
}

/** Active sessions, newest activity first. `currentSessionId` marks this device. */
export async function listSessions(
  db: DbOrTx,
  userId: string,
  currentSessionId: string,
): Promise<AccountSession[]> {
  const rows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.updatedAt));
  return rows
    .map((row) => ({
      id: row.id,
      device: describeDevice(row.userAgent),
      ipAddress: row.ipAddress || null,
      signedInAt: row.createdAt.toISOString(),
      lastActiveAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      current: row.id === currentSessionId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Signs out one of the user's other devices. Returns false if it wasn't theirs or is gone. */
export async function revokeSession(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  currentSessionId: string,
) {
  if (sessionId === currentSessionId) {
    throw new AccountError("Use Sign out to end the session on this device.");
  }
  const removed = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  return removed.length > 0;
}

/** Signs out every device except this one. Returns how many were signed out. */
export async function revokeOtherSessions(db: DbOrTx, userId: string, currentSessionId: string) {
  const removed = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)))
    .returning({ id: sessions.id });
  return removed.length;
}

/** Sites the user owns, archived ones included. */
export async function listOwnedSites(db: DbOrTx, userId: string): Promise<OwnedSite[]> {
  const rows = await db
    .select({ id: sites.id, name: sites.name, archivedAt: sites.archivedAt })
    .from(siteMembers)
    .innerJoin(sites, eq(sites.id, siteMembers.siteId))
    .where(and(eq(siteMembers.userId, userId), eq(siteMembers.role, "owner")))
    .orderBy(asc(sites.name));
  return rows.map((row) => ({ id: row.id, name: row.name, archived: row.archivedAt !== null }));
}

/**
 * Permanently deletes the account. Refused while the user owns a site. Their
 * memberships, sessions and sign-in details go with it; content, media,
 * redirects, keys, webhooks and history they created stay on the sites with
 * the author cleared (the foreign keys set it to null). Activity keeps their name.
 */
export async function deleteAccount(db: DbOrTx, userId: string, confirmEmail: string) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new AccountError("This account no longer exists.");
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new AccountError("Type your email exactly as shown to confirm.");
    }
    // Lock the user's memberships so they can't accept a transfer mid-delete.
    await tx
      .select({ siteId: siteMembers.siteId })
      .from(siteMembers)
      .where(eq(siteMembers.userId, userId))
      .for("update");
    const owned = await listOwnedSites(tx, userId);
    if (owned.length > 0) throw new OwnsSitesError(owned);
    // Site activity keeps their name; actor_id is cleared by the foreign key.
    await keepActorName(tx, userId);
    await tx.delete(users).where(eq(users.id, userId));
  });
}
