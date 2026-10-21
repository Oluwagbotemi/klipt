import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { contentEntries, siteInvitations, siteMembers, sites, users } from "@/server/db/schema";
import type { EmailMessage } from "@/server/email/transport";
import {
  approvedEmail,
  assignedEmail,
  changesRequestedEmail,
  invitationEmail,
  reviewRequestedEmail,
  transferAnsweredEmail,
  transferRequestEmail,
  type Template,
} from "@/server/email/templates";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { TRANSFER_DAYS } from "@/lib/site-settings";
import { INVITATION_DAYS } from "@/lib/team";
import { ROLE_LABELS, type SiteRole } from "@/lib/types";

/*
 * Who gets which email. These functions read the database and return ready
 * messages; they never send. Callers hand the result to sendInBackground()
 * once their change has committed. `origin` is the app's public origin
 * (no trailing slash) for links.
 *
 * Rules: never email the person who acted; assignment and review emails go
 * only to current members who haven't turned them off (users.notify_assignments);
 * security emails (invitations, transfers) always send.
 */

/** Most reviewers emailed for one review request. */
export const MAX_REVIEW_RECIPIENTS = 10;

const to = (email: string, template: Template): EmailMessage => ({ to: email, ...template });

async function siteName(db: DbOrTx, siteId: string) {
  const [site] = await db
    .select({ name: sites.name })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  return site?.name ?? "a Klipt site";
}

async function userName(db: DbOrTx, userId: string) {
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.name ?? "Someone";
}

// ---------------------------------------------------------------------------
// Invitations and transfers
// ---------------------------------------------------------------------------

/** The invitation email for an open invitation, with its link. */
export async function invitationMessage(
  db: DbOrTx,
  invitationId: string,
  url: string,
): Promise<EmailMessage | null> {
  const [row] = await db
    .select({
      email: siteInvitations.email,
      role: siteInvitations.role,
      siteName: sites.name,
      inviterName: users.name,
    })
    .from(siteInvitations)
    .innerJoin(sites, eq(sites.id, siteInvitations.siteId))
    .leftJoin(users, eq(users.id, siteInvitations.invitedById))
    .where(eq(siteInvitations.id, invitationId))
    .limit(1);
  if (!row) return null;
  return to(
    row.email,
    invitationEmail({
      inviterName: row.inviterName,
      siteName: row.siteName,
      roleLabel: ROLE_LABELS[row.role],
      url,
      days: INVITATION_DAYS,
    }),
  );
}

export async function transferRequestMessage(
  db: DbOrTx,
  input: { siteId: string; ownerId: string; recipientEmail: string; url: string },
): Promise<EmailMessage> {
  return to(
    input.recipientEmail,
    transferRequestEmail({
      ownerName: await userName(db, input.ownerId),
      siteName: await siteName(db, input.siteId),
      url: input.url,
      days: TRANSFER_DAYS,
    }),
  );
}

/** Tells the previous owner that the recipient accepted or declined. */
export async function transferAnsweredMessage(
  db: DbOrTx,
  input: {
    siteId: string;
    fromUserId: string | null;
    recipient: { id: string; name: string; email: string };
    accepted: boolean;
    retainedAdmin: boolean;
    origin: string;
  },
): Promise<EmailMessage | null> {
  if (!input.fromUserId || input.fromUserId === input.recipient.id) return null;
  const [owner] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.fromUserId))
    .limit(1);
  if (!owner) return null;
  const path = !input.accepted
    ? siteHref(input.siteId, "settings", "ownership")
    : input.retainedAdmin
      ? siteHref(input.siteId)
      : "/sites";
  return to(
    owner.email,
    transferAnsweredEmail({
      accepted: input.accepted,
      recipient: input.recipient.name || input.recipient.email,
      siteName: await siteName(db, input.siteId),
      retainedAdmin: input.retainedAdmin,
      url: `${input.origin}${path}`,
    }),
  );
}

// ---------------------------------------------------------------------------
// Assignments and reviews
// ---------------------------------------------------------------------------

export type EntryEvent =
  | { kind: "assigned"; dueOn: string | null }
  | { kind: "review_requested" }
  | { kind: "changes_requested"; note: string }
  | { kind: "approved"; scheduledAt: Date | null };

const ROLE_ORDER: SiteRole[] = ["owner", "admin", "editor"];

/** Emails about one entry after `actorId` changed it. */
export async function entryMessages(
  db: DbOrTx,
  input: { siteId: string; entryId: string; actorId: string; origin: string; event: EntryEvent },
): Promise<EmailMessage[]> {
  const { siteId, entryId, actorId, event } = input;
  const [entry] = await db
    .select({
      title: contentEntries.title,
      authorId: contentEntries.authorId,
      assigneeId: contentEntries.assigneeId,
    })
    .from(contentEntries)
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
    .limit(1);
  if (!entry) return [];

  const members = await db
    .select({
      id: users.id,
      email: users.email,
      notify: users.notifyAssignments,
      role: siteMembers.role,
    })
    .from(siteMembers)
    .innerJoin(users, eq(users.id, siteMembers.userId))
    .where(eq(siteMembers.siteId, siteId));
  const byId = new Map(members.map((member) => [member.id, member]));

  let recipientIds: (string | null)[];
  switch (event.kind) {
    case "assigned":
      recipientIds = [entry.assigneeId];
      break;
    case "review_requested": {
      // An assignee who can publish is the reviewer; otherwise the site's
      // publishers, owner first, up to a limit so large teams aren't flooded.
      const assignee = entry.assigneeId ? byId.get(entry.assigneeId) : undefined;
      if (assignee && assignee.id !== actorId && can(assignee.role, "content.publish")) {
        recipientIds = [assignee.id];
      } else {
        recipientIds = members
          .filter((member) => member.id !== actorId && can(member.role, "content.publish"))
          .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
          .slice(0, MAX_REVIEW_RECIPIENTS)
          .map((member) => member.id);
      }
      break;
    }
    case "changes_requested":
    case "approved":
      recipientIds = [entry.authorId, entry.assigneeId];
      break;
  }

  const recipients = [...new Set(recipientIds)]
    .map((id) => (id ? byId.get(id) : undefined))
    .filter((member) => member !== undefined)
    .filter((member) => member.id !== actorId && member.notify);
  if (recipients.length === 0) return [];

  const context = {
    actorName: await userName(db, actorId),
    title: entry.title,
    siteName: await siteName(db, siteId),
    url: `${input.origin}${siteHref(siteId, "content")}/${entryId}`,
    accountUrl: `${input.origin}/account`,
  };
  const template =
    event.kind === "assigned"
      ? assignedEmail({ ...context, dueOn: event.dueOn })
      : event.kind === "review_requested"
        ? reviewRequestedEmail(context)
        : event.kind === "changes_requested"
          ? changesRequestedEmail({ ...context, note: event.note })
          : approvedEmail({ ...context, scheduledAt: event.scheduledAt });
  return recipients.map((member) => to(member.email, template));
}

/** Members' notification settings (used by tests and the account page). */
export async function getNotificationSettings(db: DbOrTx, userId: string) {
  const [row] = await db
    .select({ assignments: users.notifyAssignments })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { assignments: row?.assignments ?? true };
}

export async function setAssignmentEmails(db: DbOrTx, userId: string, enabled: boolean) {
  await db.update(users).set({ notifyAssignments: enabled }).where(eq(users.id, userId));
}
