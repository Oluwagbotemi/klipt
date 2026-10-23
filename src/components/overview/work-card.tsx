import Link from "next/link";
import { CalendarClock, ListTodo } from "lucide-react";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { CardHeader, VisualCard } from "@/components/visual/card";
import { InfoChip } from "@/components/visual/info-chip";
import { Illustration } from "@/components/visual/illustration";
import { formatDue } from "@/lib/assignments";
import type { WorkItem } from "@/lib/overview";

/** Drafts and reviews assigned to the viewer, overdue first. */
export function WorkCard({
  work,
  entryHref,
  boardHref,
}: {
  work: { items: WorkItem[]; total: number; overdue: number };
  entryHref: (id: string) => string;
  boardHref: string;
}) {
  return (
    <VisualCard aria-labelledby="work-heading">
      <CardHeader
        id="work-heading"
        title="Your work"
        description={
          work.total === 0
            ? "Nothing assigned to you"
            : `${work.total} assigned to you${work.overdue ? ` · ${work.overdue} overdue` : ""}`
        }
        icon={ListTodo}
        href={boardHref}
        hrefLabel="Open assignments"
      />
      {work.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 pb-6 text-center sm:px-6">
          <Illustration scene="calendar" />
          <p className="text-muted-foreground max-w-60 text-sm">
            When someone assigns you a draft or a review, it shows up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
          {work.items.map((item) => (
            <li key={item.id}>
              <Link
                href={entryHref(item.id)}
                className="visual-nested hover:bg-accent focus-visible:ring-ring/50 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 outline-none focus-visible:ring-[3px]"
              >
                <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">
                  {item.title || "Untitled"}
                </span>
                <ContentStatusBadge status={item.status} />
                {item.dueOn && (
                  <InfoChip tone={item.overdue ? "danger" : "neutral"} icon={CalendarClock}>
                    {item.overdue ? "Overdue · " : "Due "}
                    {formatDue(item.dueOn)}
                  </InfoChip>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </VisualCard>
  );
}
