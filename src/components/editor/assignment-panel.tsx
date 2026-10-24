"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, Check, Loader2, UserRound } from "lucide-react";
import { setAssignmentAction } from "@/app/(site)/sites/[siteId]/content/actions";
import { SettingsSection } from "@/components/editor/settings-section";
import { Button } from "@/components/ui/button";
import {
  assignmentRights,
  formatDue,
  isOverdue,
  type Assignee,
  type AssignmentState,
} from "@/lib/assignments";
import type { ContentStatus } from "@/lib/content";
import { can } from "@/lib/permissions";
import { ROLE_LABELS, type SiteRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-60";

/**
 * "Assigned to" in the editor's settings column: who is working on the entry
 * and when it's due. Saves right away through its own Server Action and never
 * changes the entry's version, so it can't conflict with autosave.
 */
export function AssignmentPanel({
  siteId,
  entryId,
  role,
  userId,
  entry,
  assignment,
  assignees,
  today,
  assignmentsHref,
  emailEnabled = false,
  onChange,
}: {
  siteId: string;
  entryId: string;
  role: SiteRole;
  userId: string;
  entry: { status: ContentStatus; authorId: string | null; publishedAt: string | null };
  assignment: AssignmentState;
  assignees: Assignee[];
  /** Today in the site's time zone, "YYYY-MM-DD". */
  today: string;
  /** Team › Assignments. */
  assignmentsHref: string;
  /** Whether new assignees get an email. */
  emailEnabled?: boolean;
  onChange: (assignment: AssignmentState) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const rights = assignmentRights(role, userId, { ...entry, assigneeId: assignment.assigneeId });
  const archived = entry.status === "archived";
  const draftLike = entry.status === "draft" || entry.status === "in_review";
  // Authors can only work on drafts, so they're offered for drafts only.
  const options = assignees.filter(
    (person) =>
      draftLike || can(person.role, "content.edit_any") || person.id === assignment.assigneeId,
  );
  const overdue = isOverdue({ dueOn: assignment.dueOn, status: entry.status }, today);

  function save(next: { assigneeId: string | null; dueOn: string | null }) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setAssignmentAction(siteId, entryId, next);
      if (result.ok) {
        onChange(result.assignment);
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  const who = assignment.assigneeId
    ? assignment.assigneeId === userId
      ? "You"
      : (assignment.assigneeName ?? "A former member")
    : "Nobody";
  const summary = [
    who === "Nobody" ? "Not assigned" : who,
    assignment.dueOn ? `due ${formatDue(assignment.dueOn)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SettingsSection title="Assigned to" icon={UserRound} description={summary}>
      {rights.assignAnyone && !archived ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="entry-assignee" className="text-sm font-medium">
              Assignee
            </label>
            <select
              id="entry-assignee"
              value={assignment.assigneeId ?? ""}
              disabled={pending}
              onChange={(event) =>
                save({ assigneeId: event.target.value || null, dueOn: assignment.dueOn })
              }
              className={selectClass}
            >
              <option value="">Nobody</option>
              {options.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === userId ? `${person.name} (you)` : person.name} ·{" "}
                  {ROLE_LABELS[person.role]}
                </option>
              ))}
            </select>
            {!draftLike && (
              <p className="text-muted-foreground text-xs">
                Authors can be assigned drafts only, so they aren&apos;t listed here.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="entry-due" className="text-sm font-medium">
              Due date <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="entry-due"
                type="date"
                value={assignment.dueOn ?? ""}
                disabled={pending}
                onChange={(event) =>
                  save({ assigneeId: assignment.assigneeId, dueOn: event.target.value || null })
                }
                aria-describedby={overdue ? "entry-due-overdue" : undefined}
                className={cn(selectClass, "flex-1")}
              />
              {assignment.dueOn && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10"
                  disabled={pending}
                  onClick={() => save({ assigneeId: assignment.assigneeId, dueOn: null })}
                >
                  Clear
                </Button>
              )}
            </div>
            {overdue && (
              <p id="entry-due-overdue" className="text-warning text-xs">
                This is past its due date.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm">
            <UserRound className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span>
              {who === "Nobody"
                ? "Not assigned to anyone."
                : `${who} ${who === "You" ? "are" : "is"} working on this.`}
            </span>
          </p>
          {assignment.dueOn && (
            <p
              className={cn(
                "flex items-center gap-2 text-sm",
                overdue ? "text-warning" : "text-muted-foreground",
              )}
            >
              <CalendarClock className="size-4 shrink-0" aria-hidden />
              Due {formatDue(assignment.dueOn)}
              {overdue && " (overdue)"}
            </p>
          )}
          {!archived && rights.takeOn && assignment.assigneeId !== userId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={pending}
              onClick={() => save({ assigneeId: userId, dueOn: assignment.dueOn })}
            >
              Assign to me
            </Button>
          )}
          {!archived && rights.letGo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={pending}
              onClick={() => save({ assigneeId: null, dueOn: assignment.dueOn })}
            >
              Unassign me
            </Button>
          )}
        </div>
      )}
      <p className="text-muted-foreground text-xs" role="status">
        {pending ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
          </span>
        ) : error ? (
          <span className="text-destructive">{error}</span>
        ) : saved ? (
          <span>
            <Check className="text-success mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            Saved. It shows in{" "}
            <Link href={assignmentsHref} className="underline underline-offset-2">
              Assignments
            </Link>
            {emailEnabled ? ", and anyone you assign gets an email." : "."}
          </span>
        ) : (
          <>
            Shown in{" "}
            <Link href={assignmentsHref} className="underline underline-offset-2">
              Team › Assignments
            </Link>{" "}
            and under “Assigned to me”.
          </>
        )}
      </p>
    </SettingsSection>
  );
}
