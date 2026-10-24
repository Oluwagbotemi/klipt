"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Inbox,
  Loader2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { setAssignmentAction } from "@/app/(site)/sites/[siteId]/content/actions";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/visual/card";
import { InfoChip } from "@/components/visual/info-chip";
import { StatCard } from "@/components/visual/stat-card";
import {
  assignmentRights,
  formatDue,
  isOverdue,
  type Assignee,
  type AssignmentBoard,
} from "@/lib/assignments";
import type { EntrySummary } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { ROLE_LABELS, type SiteRole } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

type Me = { userId: string; role: SiteRole };

/** Team › Assignments: open work per member, reviews waiting, overdue and unassigned drafts. */
export function AssignmentBoardView({
  siteId,
  board,
  me,
  emailEnabled = false,
}: {
  siteId: string;
  board: AssignmentBoard;
  me: Me;
  /** Whether people are emailed about assignments and reviews. */
  emailEnabled?: boolean;
}) {
  const canAssign = can(me.role, "content.assign");
  const canReview = can(me.role, "content.publish");
  // Your own work first, then everyone else by name.
  const people = [...board.people].sort((a, b) =>
    a.id === me.userId ? -1 : b.id === me.userId ? 1 : 0,
  );
  const rowProps = { siteId, board, me, people: board.people };

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-8">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="Summary">
        <li>
          <StatCard
            icon={ClipboardCheck}
            iconTone={board.awaitingReview.length > 0 ? "info" : "neutral"}
            label="Waiting for review"
            value={board.awaitingReview.length}
            caption={board.awaitingReview.length > 0 ? "Sent by writers" : "Nothing waiting"}
          />
        </li>
        <li>
          <StatCard
            icon={AlertTriangle}
            iconTone={board.overdue.length > 0 ? "danger" : "neutral"}
            label="Overdue"
            value={board.overdue.length}
            caption={board.overdue.length > 0 ? "Past their due date" : "All on time"}
          />
        </li>
        <li className="col-span-2 sm:col-span-1">
          <StatCard
            icon={Inbox}
            iconTone={board.unassigned.length > 0 ? "warning" : "neutral"}
            label="Unassigned drafts"
            value={board.unassigned.length}
            caption={
              board.unassigned.length > 0 ? "Nobody has taken them on" : "Everything has an owner"
            }
          />
        </li>
      </ul>

      <p className="text-muted-foreground max-w-prose text-sm">
        {canAssign
          ? "Assign drafts to members and set due dates here or in the editor. "
          : "Editors assign work; you can take on your own drafts in the editor. "}
        {emailEnabled
          ? "People get an email when they're assigned something or asked for a review, and see their work here and under “Assigned to me” in Content."
          : "Klipt can't send email yet, so people see their work here and under “Assigned to me” in Content."}
      </p>

      {board.awaitingReview.length > 0 && (
        <Group
          id="review"
          title="Waiting for review"
          description={
            canReview
              ? "Open one to approve and publish it, or request changes."
              : "Sent for review. An editor will approve it or ask for changes."
          }
        >
          {board.awaitingReview.map((entry) => (
            <EntryRow key={entry.id} entry={entry} showAssignee {...rowProps} />
          ))}
        </Group>
      )}

      {board.overdue.length > 0 && (
        <Group
          id="overdue"
          title="Overdue"
          description="Past their due date and not yet published."
        >
          {board.overdue.map((entry) => (
            <EntryRow key={entry.id} entry={entry} showAssignee {...rowProps} />
          ))}
        </Group>
      )}

      <section aria-labelledby="people-heading" className="flex flex-col gap-3">
        <h2 id="people-heading" className="flex items-center gap-2 text-base font-semibold">
          <UserRound className="text-muted-foreground size-4" aria-hidden />
          By person
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {people.map((person) => (
            <section
              key={person.id}
              aria-labelledby={`person-${person.id}`}
              className={cn(
                "visual-card flex h-full flex-col",
                person.id === me.userId && "border-primary/50",
              )}
            >
              <div className="flex items-center gap-3 p-4 sm:px-5">
                <span
                  aria-hidden
                  className="bg-primary-soft text-primary-strong grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
                >
                  {initials(person.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 id={`person-${person.id}`} className="truncate text-sm font-semibold">
                    {person.name}
                    {person.id === me.userId && (
                      <span className="text-muted-foreground font-normal"> (you)</span>
                    )}
                  </h3>
                  <p className="text-muted-foreground text-xs">{ROLE_LABELS[person.role]}</p>
                </div>
                <InfoChip tone={person.items.length > 0 ? "accent" : "neutral"}>
                  {person.items.length} open
                </InfoChip>
              </div>
              {person.items.length === 0 ? (
                <p className="text-muted-foreground border-card-border flex flex-1 items-center justify-center border-t px-4 py-6 text-sm">
                  Nothing assigned.
                </p>
              ) : (
                <ul className="divide-card-border border-card-border divide-y border-t">
                  {person.items.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} compact {...rowProps} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </section>

      <Group
        id="unassigned"
        title="Unassigned drafts"
        description="Drafts and entries in review that nobody has taken on."
        empty="Every draft has someone working on it."
      >
        {board.unassigned.map((entry) => (
          <EntryRow key={entry.id} entry={entry} {...rowProps} />
        ))}
      </Group>
    </div>
  );
}

const GROUP_ICONS: Record<string, typeof Inbox> = {
  review: ClipboardCheck,
  overdue: CalendarClock,
  unassigned: Inbox,
};

function Group({
  id,
  title,
  description,
  empty,
  children,
}: {
  id: string;
  title: string;
  description: string;
  empty?: string;
  children: React.ReactNode[];
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="visual-card">
      <CardHeader
        id={`${id}-heading`}
        title={
          <>
            {title} <span className="text-muted-foreground font-normal">({children.length})</span>
          </>
        }
        description={description}
        icon={GROUP_ICONS[id] ?? Inbox}
        iconTone={id === "overdue" ? "danger" : id === "review" ? "info" : "warning"}
      />
      {children.length === 0 ? (
        <p className="text-muted-foreground border-card-border border-t px-4 py-4 text-sm sm:px-5">
          {empty}
        </p>
      ) : (
        <ul className="divide-card-border border-card-border divide-y border-t">{children}</ul>
      )}
    </section>
  );
}

function EntryRow({
  siteId,
  entry,
  board,
  me,
  people,
  compact = false,
  showAssignee = false,
}: {
  siteId: string;
  entry: EntrySummary;
  board: AssignmentBoard;
  me: Me;
  people: Assignee[];
  compact?: boolean;
  showAssignee?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const rights = assignmentRights(me.role, me.userId, entry);
  const draftLike = entry.status === "draft" || entry.status === "in_review";
  const overdue = isOverdue(entry, board.today);
  const options = people.filter(
    (person) => draftLike || can(person.role, "content.edit_any") || person.id === entry.assigneeId,
  );

  function assign(assigneeId: string | null) {
    startTransition(async () => {
      const result = await setAssignmentAction(siteId, entry.id, {
        assigneeId,
        dueOn: entry.dueOn,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const name = result.assignment.assigneeName;
      toast.success(
        assigneeId ? `“${entry.title || "Untitled"}” is assigned to ${name}.` : "Unassigned.",
      );
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1 basis-48">
        <Link
          href={`${siteHref(siteId, "content")}/${entry.id}`}
          className="focus-visible:ring-ring/50 block truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-[3px]"
        >
          {entry.title || `Untitled ${entry.modelName.toLowerCase()}`}
        </Link>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <ContentStatusBadge status={entry.status} />
          <span>{entry.modelName}</span>
          {!compact && entry.authorName && <span>· by {entry.authorName}</span>}
          {showAssignee && (
            <span className="flex items-center gap-1">
              · <UserRound className="size-3" aria-hidden />
              {entry.assigneeName ?? "Unassigned"}
            </span>
          )}
          {entry.dueOn && (
            <span className={cn("flex items-center gap-1", overdue && "text-warning")}>
              · <CalendarClock className="size-3" aria-hidden />
              {overdue ? "Overdue: " : "Due "}
              {formatDue(entry.dueOn)}
            </span>
          )}
          {!entry.dueOn && !compact && <span>· updated {formatDate(entry.updatedAt)}</span>}
        </p>
      </div>
      {rights.assignAnyone ? (
        <div className="flex items-center gap-2">
          {pending && (
            <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Saving" />
          )}
          <label htmlFor={`assign-${entry.id}`} className="sr-only">
            Assign “{entry.title || "Untitled"}”
          </label>
          <select
            id={`assign-${entry.id}`}
            value={entry.assigneeId ?? ""}
            disabled={pending}
            onChange={(event) => assign(event.target.value || null)}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 max-w-44 min-w-0 rounded-lg border px-2 text-sm outline-none focus-visible:ring-[3px]"
          >
            <option value="">Nobody</option>
            {options.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === me.userId ? `${person.name} (you)` : person.name}
              </option>
            ))}
          </select>
        </div>
      ) : rights.takeOn && entry.assigneeId !== me.userId ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => assign(me.userId)}>
          Assign to me
        </Button>
      ) : rights.letGo ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => assign(null)}>
          Unassign me
        </Button>
      ) : null}
    </li>
  );
}
