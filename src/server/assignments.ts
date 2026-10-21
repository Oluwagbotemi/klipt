import { and, asc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { recordActivity } from "@/server/activity";
import { selectEntries, toSummary } from "@/server/content";
import type { DbOrTx } from "@/server/db";
import { contentEntries, siteMembers, sites, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { publishDueEntries } from "@/server/editor";
import { getSiteRole } from "@/server/sites";
import {
  ASSIGNABLE_ROLES,
  assignmentRights,
  dueOnSchema,
  todayIn,
  type AssignmentBoard,
  type AssignmentState,
  type Assignee,
} from "@/lib/assignments";
import { can } from "@/lib/permissions";

/*
 * Who is working on what. An entry has at most one assignee (a member who
 * creates content) and an optional due date. Changing either never bumps the
 * entry's updatedAt, so it can't conflict with the editor's autosave; it is
 * logged in the site activity instead.
 */

export class AssignmentError extends Error {}

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  return role;
}

/** Members who can be assigned content, by name, and today's date in the site's time zone. */
export async function listAssignees(db: DbOrTx, userId: string, siteId: string) {
  await requireRole(db, userId, siteId);
  return { assignees: await assigneesOf(db, siteId), today: await siteToday(db, siteId) };
}

async function siteToday(db: DbOrTx, siteId: string) {
  const [site] = await db
    .select({ timezone: sites.timezone })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  return todayIn(site?.timezone || "UTC");
}

async function assigneesOf(db: DbOrTx, siteId: string): Promise<Assignee[]> {
  return db
    .select({ id: users.id, name: users.name, role: siteMembers.role })
    .from(siteMembers)
    .innerJoin(users, eq(users.id, siteMembers.userId))
    .where(and(eq(siteMembers.siteId, siteId), inArray(siteMembers.role, ASSIGNABLE_ROLES)))
    .orderBy(asc(sql`lower(${users.name})`));
}

/**
 * Sets or clears an entry's assignee and due date. Editors and above assign
 * anyone who creates content; authors may only take on or let go of entries
 * they can edit, and can't change due dates.
 */
export async function setAssignment(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
  input: { assigneeId: string | null; dueOn: string | null },
): Promise<AssignmentState & { assigneeChanged: boolean }> {
  const due = dueOnSchema.safeParse(input.dueOn ?? null);
  if (!due.success) throw new AssignmentError(due.error.issues[0].message);
  const dueOn = due.data;

  return db.transaction(async (tx) => {
    const role = await requireRole(tx, userId, siteId);
    const [entry] = await tx
      .select()
      .from(contentEntries)
      .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
      .for("update")
      .limit(1);
    if (!entry) throw new NotAllowedError("Entry not found.");

    const rights = assignmentRights(role, userId, entry);
    const assigneeChanged = input.assigneeId !== entry.assigneeId;
    const dueChanged = dueOn !== entry.dueOn;
    if (!assigneeChanged && !dueChanged) {
      return { ...(await stateOf(entry.assigneeId, null, entry.dueOn, tx)), assigneeChanged };
    }

    if (entry.status === "archived") {
      throw new AssignmentError("Restore this entry before assigning it.");
    }
    if (dueChanged && !rights.setDue) throw new NotAllowedError("Can't change the due date.");
    if (assigneeChanged) {
      const allowed =
        rights.assignAnyone ||
        (input.assigneeId === userId && rights.takeOn) ||
        (input.assigneeId === null && entry.assigneeId === userId && rights.letGo);
      if (!allowed) throw new NotAllowedError("Can't change who this is assigned to.");
    }

    let assigneeName: string | null = null;
    if (input.assigneeId) {
      const [member] = await tx
        .select({ name: users.name, role: siteMembers.role })
        .from(siteMembers)
        .innerJoin(users, eq(users.id, siteMembers.userId))
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, input.assigneeId)))
        .limit(1);
      if (!member || !can(member.role, "content.create")) {
        throw new AssignmentError("Pick a member who can work on content.");
      }
      if (
        !can(member.role, "content.edit_any") &&
        entry.status !== "draft" &&
        entry.status !== "in_review"
      ) {
        throw new AssignmentError(
          "Authors can only be assigned drafts and entries in review. Unpublish it first, or pick an editor.",
        );
      }
      assigneeName = member.name;
    }

    let previousName: string | null = null;
    if (assigneeChanged && entry.assigneeId) {
      const [previous] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, entry.assigneeId))
        .limit(1);
      previousName = previous?.name ?? null;
    }

    // Keep updatedAt: assignment isn't an edit and must not trip the editor's version check.
    await tx
      .update(contentEntries)
      .set({ assigneeId: input.assigneeId, dueOn, updatedAt: entry.updatedAt })
      .where(eq(contentEntries.id, entryId));

    const target = { siteId, actorId: userId, targetType: "content_entry", targetId: entryId };
    if (assigneeChanged) {
      await recordActivity(tx, {
        ...target,
        action: input.assigneeId ? "content.assigned" : "content.unassigned",
        metadata: input.assigneeId
          ? { title: entry.title, assigneeId: input.assigneeId, assigneeName, previousName }
          : { title: entry.title, previousName },
      });
    }
    if (dueChanged) {
      await recordActivity(tx, {
        ...target,
        action: "content.due_changed",
        metadata: { title: entry.title, dueOn },
      });
    }
    return { assigneeId: input.assigneeId, assigneeName, dueOn, assigneeChanged };
  });
}

async function stateOf(
  assigneeId: string | null,
  name: string | null,
  dueOn: string | null,
  db: DbOrTx,
): Promise<AssignmentState> {
  if (!assigneeId || name) return { assigneeId, assigneeName: name, dueOn };
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, assigneeId))
    .limit(1);
  return { assigneeId, assigneeName: user?.name ?? null, dueOn };
}

/**
 * Clears a member's assignments on a site (when they leave, are removed, or
 * can no longer create content). Logged once per affected entry.
 */
export async function clearAssignments(
  tx: DbOrTx,
  siteId: string,
  memberId: string,
  actorId: string | null,
  memberName: string | null,
) {
  const cleared = await tx
    .update(contentEntries)
    .set({ assigneeId: null, updatedAt: sql`${contentEntries.updatedAt}` })
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.assigneeId, memberId)))
    .returning({ id: contentEntries.id, title: contentEntries.title });
  for (const entry of cleared) {
    await recordActivity(tx, {
      siteId,
      actorId,
      action: "content.unassigned",
      targetType: "content_entry",
      targetId: entry.id,
      metadata: { title: entry.title, previousName: memberName, automatic: true },
    });
  }
  return cleared.length;
}

const OPEN_STATUSES = ["draft", "in_review", "scheduled"] as const;
const BOARD_LIMIT = 100;

/** Team › Assignments: open work grouped by person, reviews waiting, overdue and unassigned drafts. */
export async function getAssignmentBoard(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<AssignmentBoard> {
  const role = await requireRole(db, userId, siteId);
  if (!can(role, "content.create")) {
    throw new NotAllowedError("Your role can't work on content.");
  }
  await publishDueEntries(db, siteId);
  const today = await siteToday(db, siteId);

  const [people, assigned, review, overdue, unassigned] = await Promise.all([
    assigneesOf(db, siteId),
    selectEntries(db)
      .where(
        and(
          eq(contentEntries.siteId, siteId),
          inArray(contentEntries.status, [...OPEN_STATUSES]),
          sql`${contentEntries.assigneeId} is not null`,
        ),
      )
      .orderBy(sql`${contentEntries.dueOn} asc nulls last`, asc(contentEntries.updatedAt))
      .limit(BOARD_LIMIT * 5),
    selectEntries(db)
      .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.status, "in_review")))
      .orderBy(asc(contentEntries.updatedAt))
      .limit(BOARD_LIMIT),
    selectEntries(db)
      .where(
        and(
          eq(contentEntries.siteId, siteId),
          lt(contentEntries.dueOn, today),
          notInArray(contentEntries.status, ["published", "archived"]),
        ),
      )
      .orderBy(asc(contentEntries.dueOn))
      .limit(BOARD_LIMIT),
    selectEntries(db)
      .where(
        and(
          eq(contentEntries.siteId, siteId),
          isNull(contentEntries.assigneeId),
          inArray(contentEntries.status, ["draft", "in_review"]),
        ),
      )
      .orderBy(asc(contentEntries.updatedAt))
      .limit(BOARD_LIMIT),
  ]);

  const byPerson = new Map(
    people.map((person) => [person.id, [] as ReturnType<typeof toSummary>[]]),
  );
  for (const row of assigned) {
    const list = row.assigneeId ? byPerson.get(row.assigneeId) : undefined;
    if (list && list.length < BOARD_LIMIT) list.push(toSummary(row));
  }
  return {
    today,
    people: people.map((person) => ({ ...person, items: byPerson.get(person.id) ?? [] })),
    awaitingReview: review.map(toSummary),
    overdue: overdue.map(toSummary),
    unassigned: unassigned.map(toSummary),
  };
}
