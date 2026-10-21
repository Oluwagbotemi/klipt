import { z } from "zod";
import { canEditEntry, type ContentStatus, type EntrySummary } from "@/lib/content";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";

/*
 * Assignments (Team › Assignments, the editor's "Assigned to" panel): who may
 * assign what, plus the shapes shared by server and client. The server
 * re-checks everything in src/server/assignments.ts.
 */

/** Roles that work on content and can therefore be assigned it. */
export const ASSIGNABLE_ROLES: SiteRole[] = ["owner", "admin", "editor", "author"];

export interface Assignee {
  id: string;
  name: string;
  role: SiteRole;
}

export interface AssignmentState {
  assigneeId: string | null;
  assigneeName: string | null;
  dueOn: string | null;
}

export interface AssignmentBoard {
  /** Today in the site's time zone, "YYYY-MM-DD" (an entry due before today is overdue). */
  today: string;
  people: (Assignee & { items: EntrySummary[] })[];
  awaitingReview: EntrySummary[];
  overdue: EntrySummary[];
  unassigned: EntrySummary[];
}

type AssignmentEntry = {
  status: ContentStatus;
  authorId: string | null;
  assigneeId: string | null;
  publishedAt: string | Date | null;
};

/**
 * What a member may change about an entry's assignment. Editors and above
 * assign anyone and set due dates. Authors may take on entries they can
 * already edit (their own drafts) and let go of entries assigned to them;
 * they can't hand work to others, so assignment never widens what they edit
 * beyond what someone with assign rights gave them.
 */
export function assignmentRights(role: SiteRole, userId: string, entry: AssignmentEntry) {
  const manager = can(role, "content.assign");
  return {
    assignAnyone: manager,
    setDue: manager,
    takeOn: can(role, "content.create") && canEditEntry(role, userId, entry),
    letGo: entry.assigneeId === userId,
  };
}

/** A due date: a real calendar day within five years either side of today, or none. */
export const dueOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Pick a real date.")
  .refine((value) => {
    const years = Math.abs(Date.parse(`${value}T00:00:00Z`) - Date.now()) / 31_557_600_000;
    return years <= 5;
  }, "Pick a date within five years.")
  .nullable();

/** Today's date in a time zone, "YYYY-MM-DD". */
export function todayIn(timezone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isOverdue(entry: Pick<EntrySummary, "dueOn" | "status">, today: string) {
  return (
    entry.dueOn !== null &&
    entry.dueOn < today &&
    entry.status !== "published" &&
    entry.status !== "archived"
  );
}

const dueFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "4 Nov 2026" for a "YYYY-MM-DD" due date (no time zone shift). */
export function formatDue(dueOn: string) {
  const date = new Date(`${dueOn}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? dueOn : dueFormat.format(date);
}
