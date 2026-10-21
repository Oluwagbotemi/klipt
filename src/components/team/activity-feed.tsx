"use client";

import { useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, History, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_KINDS,
  type ActivityFeed,
  type ActivityItem,
  type ActivityParams,
} from "@/lib/activity";
import { todayIn } from "@/lib/assignments";
import { formatDateTime } from "@/lib/format";
import { cn, initials } from "@/lib/utils";

const fieldClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

function hrefWith(pathname: string, filters: ActivityParams, changes: Partial<ActivityParams>) {
  const next = { ...filters, page: 1, ...changes };
  const query = new URLSearchParams();
  if (next.person) query.set("person", next.person);
  if (next.kind) query.set("kind", next.kind);
  if (next.from) query.set("from", next.from);
  if (next.to) query.set("to", next.to);
  if (next.page > 1) query.set("page", String(next.page));
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

let clock: number | null = null;
const readClock = () => (clock ??= Date.now());
function subscribeClock(notify: () => void) {
  const timer = setInterval(() => {
    clock = Date.now();
    notify();
  }, 60_000);
  return () => clearInterval(timer);
}
/**
 * The current time, updated every minute in the browser; null while rendering
 * on the server, so relative times never mismatch the server render.
 */
function useNow() {
  return useSyncExternalStore(subscribeClock, readClock, () => null);
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeTime(iso: string, now: number) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}

const dayHeading = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (day === yesterday) return "Yesterday";
  // Joined by hand: browsers and Node differ on punctuation ("Monday, 19 October").
  const parts = Object.fromEntries(
    dayHeading.formatToParts(new Date(`${day}T00:00:00Z`)).map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/** Team › Activity: filters in the URL, events grouped by day in the site's time zone. */
export function ActivityFeedView({
  feed,
  filters,
  limited,
}: {
  feed: ActivityFeed;
  filters: ActivityParams;
  /** True when the viewer only sees content, media and structure activity. */
  limited: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const now = useNow();
  const today = todayIn(feed.timezone);
  const filtered = Boolean(filters.person || filters.kind || filters.from || filters.to);

  const go = (changes: Partial<ActivityParams>) =>
    startNavigation(() => router.replace(hrefWith(pathname, filters, changes), { scroll: false }));

  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const item of feed.items) {
    const last = groups.at(-1);
    if (last?.day === item.day) last.items.push(item);
    else groups.push({ day: item.day, items: [item] });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-8">
      <section aria-label="Filter activity" className="bg-card rounded-2xl border p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="activity-person" className="text-sm font-medium">
              Person
            </label>
            <select
              id="activity-person"
              value={filters.person}
              onChange={(e) => go({ person: e.target.value })}
              className={fieldClass}
            >
              <option value="">Everyone</option>
              {feed.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="activity-kind" className="text-sm font-medium">
              Kind
            </label>
            <select
              id="activity-kind"
              value={filters.kind}
              onChange={(e) => go({ kind: e.target.value as ActivityParams["kind"] })}
              className={fieldClass}
            >
              <option value="">All kinds</option>
              {feed.kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {ACTIVITY_KINDS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="activity-from" className="text-sm font-medium">
              From
            </label>
            <input
              id="activity-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => go({ from: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="activity-to" className="text-sm font-medium">
              To
            </label>
            <input
              id="activity-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => go({ to: e.target.value })}
              className={fieldClass}
            />
          </div>
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p>
            Dates use the site&apos;s time zone ({feed.timezone}). Activity is kept for a year.
            {limited && " Your role shows content, media and structure changes."}
          </p>
          {filtered && (
            <Link
              href={pathname}
              replace
              className="text-foreground focus-visible:ring-ring/50 rounded-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-[3px]"
            >
              Clear filters
            </Link>
          )}
        </div>
      </section>

      <p className="sr-only" aria-live="polite">
        {navigating ? "Loading" : `${feed.items.length} events shown`}
      </p>

      <div
        className={cn("transition-opacity", navigating && "opacity-60")}
        aria-busy={navigating || undefined}
      >
        {feed.items.length === 0 ? (
          filtered || feed.page > 1 ? (
            <EmptyState
              icon={SearchX}
              title="No matching activity"
              description="Nothing happened that matches these filters. Try another person, kind or date range."
              action={
                <Button variant="outline" asChild>
                  <Link href={pathname} replace>
                    Clear filters
                  </Link>
                </Button>
              }
              className="py-12 sm:py-16"
            />
          ) : (
            <EmptyState
              icon={History}
              title="No activity yet"
              description="Changes to content, media, settings and the team will appear here as people work on the site."
              className="py-12 sm:py-16"
            />
          )
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.day} aria-labelledby={`day-${group.day}`}>
                <h2
                  id={`day-${group.day}`}
                  className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wide uppercase"
                >
                  {dayLabel(group.day, today)}
                </h2>
                <ol className="bg-card divide-y rounded-2xl border">
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} item={item} now={now} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>

      {(feed.page > 1 || feed.hasMore) && (
        <nav
          aria-label="Pages of activity"
          className="text-muted-foreground flex items-center justify-between gap-3 text-sm"
        >
          {feed.page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={hrefWith(pathname, filters, { page: feed.page - 1 })} replace>
                <ChevronLeft aria-hidden /> Newer
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span>Page {feed.page}</span>
          {feed.hasMore ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={hrefWith(pathname, filters, { page: feed.page + 1 })} replace>
                Older <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function ActivityRow({ item, now }: { item: ActivityItem; now: number | null }) {
  const exact = formatDateTime(item.createdAt);
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold",
          item.actorActive
            ? "bg-muted text-muted-foreground"
            : "bg-muted/50 text-muted-foreground/70",
        )}
      >
        {initials(item.actorName) || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words">
          <span className="font-medium">{item.actorName}</span> {item.verb}
          {item.target && (
            <>
              {" "}
              {item.href ? (
                <Link
                  href={item.href}
                  className="focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-[3px]"
                >
                  “{item.target}”
                </Link>
              ) : (
                <span className="font-medium">“{item.target}”</span>
              )}
            </>
          )}
          {item.detail && (item.detail.startsWith(":") ? item.detail : ` ${item.detail}`)}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <time dateTime={item.createdAt} title={exact}>
            {now === null ? exact : relativeTime(item.createdAt, now)}
          </time>
          <Badge variant="outline" className="h-5 px-1.5 text-[0.7rem] font-normal">
            {ACTIVITY_KINDS[item.kind]}
          </Badge>
        </p>
      </div>
    </li>
  );
}
