import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import { auditEvents, siteMembers, siteOwnershipTransfers, sites, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/secrets";
import { getSiteRole } from "@/server/sites";
import { TRANSFER_DAYS, type OwnershipState } from "@/lib/site-settings";

export type { OwnershipState };

/*
 * Site ownership transfer. The owner creates a pending transfer (a link to
 * share, until email exists); nothing changes until the recipient, signed in
 * with the named email, accepts. Acceptance swaps the owner in one
 * transaction. The account itself is never transferred, only the site.
 */

export class TransferError extends Error {}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const transferEmail = (email: string) => email.trim().toLowerCase();

async function requireOwner(tx: DbOrTx, userId: string, siteId: string) {
  if ((await getSiteRole(tx, userId, siteId)) !== "owner") {
    throw new NotAllowedError("Only the owner can transfer the site.");
  }
}

/** Expired pending transfers are marked expired so a new one can be started. */
async function expireStale(tx: DbOrTx, siteId: string) {
  await tx
    .update(siteOwnershipTransfers)
    .set({ status: "expired", respondedAt: new Date() })
    .where(
      and(
        eq(siteOwnershipTransfers.siteId, siteId),
        eq(siteOwnershipTransfers.status, "pending"),
        sql`${siteOwnershipTransfers.expiresAt} <= now()`,
      ),
    );
}

export async function getOwnershipState(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<OwnershipState> {
  const role = await getSiteRole(db, userId, siteId);
  if (role !== "owner" && role !== "admin") throw new NotAllowedError("Not allowed.");
  await expireStale(db, siteId);
  const [[owner], transfers] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(siteMembers)
      .innerJoin(users, eq(users.id, siteMembers.userId))
      .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.role, "owner"))),
    db
      .select()
      .from(siteOwnershipTransfers)
      .where(eq(siteOwnershipTransfers.siteId, siteId))
      .orderBy(sql`${siteOwnershipTransfers.createdAt} desc`)
      .limit(20),
  ]);
  const pending = transfers.find((t) => t.status === "pending");
  return {
    owner,
    pending: pending
      ? {
          id: pending.id,
          recipientEmail: pending.recipientEmail,
          previousOwnerRetainsAdmin: pending.previousOwnerRetainsAdmin,
          createdAt: pending.createdAt.toISOString(),
          expiresAt: pending.expiresAt.toISOString(),
          linkAvailable: Boolean(pending.tokenEncrypted),
        }
      : null,
    history: transfers
      .filter((t) => t.status !== "pending")
      .map((t) => ({
        id: t.id,
        status: t.status,
        recipientEmail: t.recipientEmail,
        createdAt: t.createdAt.toISOString(),
        respondedAt: t.respondedAt?.toISOString() ?? null,
      })),
  };
}

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
    tokenEncrypted: encryptSecret(token),
    expiresAt: new Date(Date.now() + TRANSFER_DAYS * 86_400_000),
  };
}

/** Starts a transfer. Returns the token for the link. */
export async function startTransfer(
  db: DbOrTx,
  owner: { id: string; email: string },
  siteId: string,
  input: { email: string; previousOwnerRetainsAdmin: boolean },
): Promise<string> {
  const email = transferEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new TransferError("Enter a valid email address.");
  }
  if (email === transferEmail(owner.email)) throw new TransferError("You already own this site.");
  try {
    return await db.transaction(async (tx) => {
      await requireOwner(tx, owner.id, siteId);
      await expireStale(tx, siteId);
      const [recipient] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      const { token, ...secret } = newToken();
      const [transfer] = await tx
        .insert(siteOwnershipTransfers)
        .values({
          siteId,
          fromUserId: owner.id,
          recipientEmail: email,
          recipientUserId: recipient?.id ?? null,
          previousOwnerRetainsAdmin: input.previousOwnerRetainsAdmin,
          ...secret,
        })
        .returning({ id: siteOwnershipTransfers.id });
      await tx.insert(auditEvents).values({
        siteId,
        actorId: owner.id,
        action: "ownership.transfer_requested",
        targetType: "ownership_transfer",
        targetId: transfer.id,
        metadata: {
          recipientEmail: email,
          previousOwnerRetainsAdmin: input.previousOwnerRetainsAdmin,
        },
      });
      return token;
    });
  } catch (error) {
    if (isUniqueViolation(error, "site_ownership_transfers_one_pending")) {
      throw new TransferError("A transfer is already pending. Cancel it first.");
    }
    throw error;
  }
}

async function pendingFor(tx: DbOrTx, siteId: string) {
  const [pending] = await tx
    .select()
    .from(siteOwnershipTransfers)
    .where(
      and(
        eq(siteOwnershipTransfers.siteId, siteId),
        eq(siteOwnershipTransfers.status, "pending"),
        gt(siteOwnershipTransfers.expiresAt, new Date()),
      ),
    )
    .for("update")
    .limit(1);
  if (!pending) throw new TransferError("There's no pending transfer.");
  return pending;
}

export async function transferLinkToken(db: DbOrTx, userId: string, siteId: string) {
  await requireOwner(db, userId, siteId);
  const pending = await pendingFor(db, siteId);
  if (!pending.tokenEncrypted) throw new TransferError("Get a new link to share this transfer.");
  return decryptSecret(pending.tokenEncrypted);
}

/** Replaces the link (the old one stops working) and restarts the 7 days. */
export async function renewTransferLink(db: DbOrTx, userId: string, siteId: string) {
  return db.transaction(async (tx) => {
    await requireOwner(tx, userId, siteId);
    const pending = await pendingFor(tx, siteId);
    const { token, ...secret } = newToken();
    await tx
      .update(siteOwnershipTransfers)
      .set(secret)
      .where(eq(siteOwnershipTransfers.id, pending.id));
    return token;
  });
}

export async function cancelTransfer(db: DbOrTx, userId: string, siteId: string) {
  await db.transaction(async (tx) => {
    await requireOwner(tx, userId, siteId);
    const pending = await pendingFor(tx, siteId);
    await tx
      .update(siteOwnershipTransfers)
      .set({ status: "cancelled", respondedAt: new Date() })
      .where(eq(siteOwnershipTransfers.id, pending.id));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "ownership.transfer_cancelled",
      targetType: "ownership_transfer",
      targetId: pending.id,
      metadata: { recipientEmail: pending.recipientEmail },
    });
  });
}

// ---------------------------------------------------------------------------
// Recipient
// ---------------------------------------------------------------------------

export type TransferPreview =
  | { state: "invalid" }
  | { state: "closed"; siteName: string; status: string }
  | {
      state: "open";
      siteName: string;
      siteDomain: string | null;
      fromName: string;
      recipientEmail: string;
      previousOwnerRetainsAdmin: boolean;
      expiresAt: string;
    };

export async function previewTransfer(db: DbOrTx, token: string): Promise<TransferPreview> {
  if (!/^[\w-]{20,100}$/.test(token)) return { state: "invalid" };
  const [row] = await db
    .select({
      transfer: siteOwnershipTransfers,
      siteName: sites.name,
      siteDomain: sites.domain,
      archivedAt: sites.archivedAt,
      fromName: users.name,
    })
    .from(siteOwnershipTransfers)
    .innerJoin(sites, eq(sites.id, siteOwnershipTransfers.siteId))
    .leftJoin(users, eq(users.id, siteOwnershipTransfers.fromUserId))
    .where(eq(siteOwnershipTransfers.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.archivedAt) return { state: "invalid" };
  const { transfer } = row;
  const expired = transfer.status === "pending" && transfer.expiresAt <= new Date();
  if (transfer.status !== "pending" || expired) {
    return {
      state: "closed",
      siteName: row.siteName,
      status: expired ? "expired" : transfer.status,
    };
  }
  return {
    state: "open",
    siteName: row.siteName,
    siteDomain: row.siteDomain,
    fromName: row.fromName ?? "The site owner",
    recipientEmail: transfer.recipientEmail,
    previousOwnerRetainsAdmin: transfer.previousOwnerRetainsAdmin,
    expiresAt: transfer.expiresAt.toISOString(),
  };
}

async function openTransferForRecipient(tx: DbOrTx, user: { email: string }, token: string) {
  const [transfer] = await tx
    .select()
    .from(siteOwnershipTransfers)
    .where(
      and(
        eq(siteOwnershipTransfers.tokenHash, hashToken(token)),
        eq(siteOwnershipTransfers.status, "pending"),
        gt(siteOwnershipTransfers.expiresAt, new Date()),
      ),
    )
    .for("update")
    .limit(1);
  if (!transfer) throw new TransferError("This transfer is no longer open.");
  if (transfer.recipientEmail !== transferEmail(user.email)) {
    throw new TransferError(
      `This transfer is for ${transfer.recipientEmail}. Sign in with that email.`,
    );
  }
  const [site] = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, transfer.siteId), isNull(sites.archivedAt)))
    .for("update");
  if (!site) throw new TransferError("This site is no longer available.");
  return transfer;
}

/** Accepts: the recipient becomes owner; the previous owner becomes Admin or leaves. */
export async function acceptTransfer(
  db: DbOrTx,
  user: { id: string; email: string },
  token: string,
) {
  return db.transaction(async (tx) => {
    const transfer = await openTransferForRecipient(tx, user, token);
    const siteId = transfer.siteId;
    const [currentOwner] = await tx
      .select({ userId: siteMembers.userId })
      .from(siteMembers)
      .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.role, "owner")))
      .for("update");
    if (!currentOwner || currentOwner.userId !== transfer.fromUserId) {
      throw new TransferError("The site's owner changed since this transfer was created.");
    }

    // Demote (or remove) the previous owner first: only one owner may exist.
    if (transfer.previousOwnerRetainsAdmin) {
      await tx
        .update(siteMembers)
        .set({ role: "admin", updatedAt: new Date() })
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, currentOwner.userId)));
    } else {
      await tx
        .delete(siteMembers)
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, currentOwner.userId)));
    }
    await tx
      .insert(siteMembers)
      .values({ siteId, userId: user.id, role: "owner" })
      .onConflictDoUpdate({
        target: [siteMembers.siteId, siteMembers.userId],
        set: { role: "owner", updatedAt: new Date() },
      });
    await tx
      .update(siteOwnershipTransfers)
      .set({ status: "accepted", recipientUserId: user.id, respondedAt: new Date() })
      .where(eq(siteOwnershipTransfers.id, transfer.id));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: user.id,
      action: "ownership.transfer_accepted",
      targetType: "ownership_transfer",
      targetId: transfer.id,
      metadata: {
        fromUserId: transfer.fromUserId,
        toUserId: user.id,
        previousOwnerRetainsAdmin: transfer.previousOwnerRetainsAdmin,
      },
    });
    return { siteId };
  });
}

export async function declineTransfer(
  db: DbOrTx,
  user: { id: string; email: string },
  token: string,
) {
  await db.transaction(async (tx) => {
    const transfer = await openTransferForRecipient(tx, user, token);
    await tx
      .update(siteOwnershipTransfers)
      .set({ status: "declined", recipientUserId: user.id, respondedAt: new Date() })
      .where(eq(siteOwnershipTransfers.id, transfer.id));
    await tx.insert(auditEvents).values({
      siteId: transfer.siteId,
      actorId: user.id,
      action: "ownership.transfer_declined",
      targetType: "ownership_transfer",
      targetId: transfer.id,
      metadata: {},
    });
  });
}
