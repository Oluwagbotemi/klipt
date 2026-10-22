"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  MoreHorizontal,
  Search,
  SearchX,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { NewEntryButton } from "@/components/content/new-entry-button";
import { useEntryActions } from "@/components/content/use-entry-actions";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useOverflowFade } from "@/hooks/use-overflow-fade";
import {
  CONTENT_STATUSES,
  PAGE_SIZE,
  SORTS,
  STATUS_LABELS,
  entryActions,
  type BulkAction,
  type ContentListParams,
  type ContentSort,
  type ContentType,
  type EntryList,
  type EntrySummary,
  type StatusFilter,
} from "@/lib/content";
import { formatDue, isOverdue } from "@/lib/assignments";
import { formatDate } from "@/lib/format";
import type { CollectionType } from "@/lib/models";
import { siteHref } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import type { SiteRole } from "@/lib/types";
import { entryDate, entryPath, type PathRules } from "@/lib/url-patterns";
import { cn } from "@/lib/utils";

const TYPE_NOUN: Record<ContentType, { one: string; many: string }> = {
  all: { one: "item", many: "content" },
  page: { one: "page", many: "pages" },
  post: { one: "post", many: "posts" },
  collection: { one: "entry", many: "collection entries" },
};

/** Builds a list URL from the current parameters plus changes, omitting defaults. */
function listHref(
  pathname: string,
  params: ContentListParams,
  changes: Partial<ContentListParams>,
) {
  const next = { ...params, page: 1, ...changes };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.status !== "active") query.set("status", next.status);
  if (next.sort !== "updated_desc") query.set("sort", next.sort);
  if (next.page > 1) query.set("page", String(next.page));
  if (next.term) query.set("term", next.term);
  if (next.assignee) query.set("assignee", next.assignee);
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function ContentList({
  siteId,
  type,
  role,
  userId,
  list,
  params,
  collections,
  defaultModelKey,
  pathRules,
  today,
}: {
  siteId: string;
  type: ContentType;
  role: SiteRole;
  userId: string;
  list: EntryList;
  params: ContentListParams;
  /** Today in the site's time zone, for overdue due dates. */
  today: string;
  /** Custom content types, for the New button. */
  collections: CollectionType[];
  /** All content: the type the New button creates (Settings › Publishing). */
  defaultModelKey?: string | null;
  /** The site's URL patterns, to show each entry's public path. */
  pathRules: PathRules;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [query, setQuery] = useState(params.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const noun = TYPE_NOUN[type];
  const pathOf = (entry: EntrySummary) =>
    entryPath(pathRules, entry.modelKey, entry.slug, entryDate(entry));
  const canCreate =
    can(role, "content.create") && (type !== "collection" || collections.length > 0);
  const newButton = (
    <NewEntryButton
      siteId={siteId}
      type={type === "all" ? "choose" : type}
      collections={collections}
      defaultKey={defaultModelKey ?? undefined}
    />
  );

  const actions = useEntryActions({
    siteId,
    role,
    userId,
    onDone: () => setSelected(new Set()),
  });

  // Keep the box in sync when the URL changes (Back button, Clear filters).
  const [syncedQ, setSyncedQ] = useState(params.q);
  if (params.q !== syncedQ) {
    setSyncedQ(params.q);
    setQuery(params.q);
  }

  // Debounced search: update the URL 300ms after typing stops.
  useEffect(() => {
    if (query.trim() === params.q) return;
    const timer = setTimeout(() => {
      startNavigation(() => router.replace(listHref(pathname, params, { q: query.trim() })));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, params, pathname, router]);

  // Selection only covers rows on this page; drop ids that left it.
  const visibleIds = new Set(list.items.map((e) => e.id));
  const selectedEntries = list.items.filter((e) => selected.has(e.id));
  if (selectedEntries.length !== selected.size) {
    setSelected(new Set(selectedEntries.map((e) => e.id)));
  }
  const allSelected = list.items.length > 0 && selectedEntries.length === list.items.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }

  const go = (changes: Partial<ContentListParams>) =>
    startNavigation(() => router.replace(listHref(pathname, params, changes)));

  // Counts are scoped to the search, so a search with no hits is "no matches",
  // while an empty status view only counts as filtered if anything exists at all.
  const totalAll = Object.values(list.counts).reduce((a, b) => a + b, 0);
  const filtered =
    params.q !== "" ||
    params.term !== "" ||
    params.assignee !== "" ||
    (params.status !== "active" && totalAll > 0);
  const assignedToMe = params.assignee === "me";
  const first = (list.page - 1) * PAGE_SIZE + 1;
  const last = first + list.items.length - 1;

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-8 sm:py-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <label htmlFor="content-search" className="sr-only">
            Search {noun.many}
          </label>
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="content-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or URL slug"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <label htmlFor="content-sort" className="text-muted-foreground shrink-0 text-sm">
            Sort
          </label>
          <select
            id="content-sort"
            value={params.sort}
            onChange={(e) => go({ sort: e.target.value as ContentSort })}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px] lg:flex-none"
          >
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {canCreate && newButton}
        </div>
      </div>

      {can(role, "content.create") && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={listHref(pathname, params, { assignee: assignedToMe ? "" : "me" })}
            replace
            scroll={false}
            aria-pressed={assignedToMe}
            className={cn(
              "focus-visible:ring-ring/50 flex h-8 items-center gap-1.5 rounded-full border px-3 transition-colors outline-none focus-visible:ring-[3px]",
              assignedToMe
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <UserRound className="size-3.5" aria-hidden />
            Assigned to me
          </Link>
          {params.assignee && !assignedToMe && (
            <Badge variant="secondary" className="max-w-full gap-1">
              {params.assignee === "none"
                ? "Unassigned"
                : `Assigned to ${list.assigneeName ?? "a former member"}`}
              <Link
                href={listHref(pathname, params, { assignee: "" })}
                aria-label="Remove assignee filter"
                className="hover:text-foreground focus-visible:ring-ring/50 -mr-1 rounded-sm outline-none focus-visible:ring-[3px]"
              >
                <X className="size-3.5" aria-hidden />
              </Link>
            </Badge>
          )}
        </div>
      )}

      {params.term && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Showing entries with</span>
          <Badge variant="secondary" className="max-w-full gap-1 font-mono break-all">
            {params.term.replace(":", " › ")}
            <Link
              href={listHref(pathname, params, { term: "" })}
              aria-label="Remove term filter"
              className="hover:text-foreground focus-visible:ring-ring/50 -mr-1 rounded-sm outline-none focus-visible:ring-[3px]"
            >
              <X className="size-3.5" aria-hidden />
            </Link>
          </Badge>
        </p>
      )}

      <StatusFilters
        counts={list.counts}
        current={params.status}
        hrefFor={(status) => listHref(pathname, params, { status })}
      />

      {/* Bulk actions */}
      {selectedEntries.length > 0 && (
        <BulkBar
          count={selectedEntries.length}
          pending={actions.pending}
          counts={{
            archive: actions.allowed("archive", selectedEntries).length,
            restore: actions.allowed("restore", selectedEntries).length,
            delete: actions.allowed("delete", selectedEntries).length,
          }}
          onAction={(action) => actions.request(action, selectedEntries)}
          onClear={() => setSelected(new Set())}
        />
      )}

      <p className="sr-only" aria-live="polite">
        {navigating ? "Loading" : `${list.total} ${list.total === 1 ? noun.one : noun.many}`}
      </p>

      <div
        className={cn("transition-opacity", navigating && "opacity-60")}
        aria-busy={navigating || undefined}
      >
        {list.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title={`No matching ${noun.many}`}
              description={
                params.q
                  ? `Nothing matches “${params.q}”${params.status !== "active" ? ` in ${STATUS_LABELS[params.status]}` : ""}.`
                  : `There's nothing in ${params.status === "active" ? "this view" : STATUS_LABELS[params.status]}.`
              }
              action={
                <Button variant="outline" asChild>
                  <Link href={pathname} onClick={() => setQuery("")}>
                    Clear filters
                  </Link>
                </Button>
              }
              className="py-12 sm:py-16"
            />
          ) : type === "collection" && collections.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No custom content types yet"
              description="Collections hold entries of your own content types, like Products or Events. Owners and admins set them up in Content models."
              action={
                <Button variant="outline" asChild>
                  <Link href={siteHref(siteId, "models")}>Go to Content models</Link>
                </Button>
              }
              className="py-12 sm:py-16"
            />
          ) : (
            <EmptyState
              icon={FileText}
              title={`No ${noun.many} yet`}
              description={
                canCreate
                  ? `Create your first ${type === "all" ? "page or post" : type === "collection" ? "entry" : noun.one} to get started.`
                  : `When your team adds ${noun.many}, they'll appear here.`
              }
              action={canCreate ? newButton : undefined}
              className="py-12 sm:py-16"
            />
          )
        ) : (
          <>
            <EntryTable
              siteId={siteId}
              entries={list.items}
              showType={type === "all" || type === "collection"}
              today={today}
              pathOf={pathOf}
              selected={selected}
              allSelected={allSelected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              rowActions={(entry) => (
                <RowMenu
                  entry={entry}
                  siteId={siteId}
                  permitted={entryActions(role, userId, entry)}
                  onAction={(action) => actions.request(action, [entry])}
                />
              )}
            />
            <EntryCards
              siteId={siteId}
              entries={list.items}
              showType={type === "all" || type === "collection"}
              today={today}
              pathOf={pathOf}
              selected={selected}
              onToggle={toggle}
              rowActions={(entry) => (
                <RowMenu
                  entry={entry}
                  siteId={siteId}
                  permitted={entryActions(role, userId, entry)}
                  onAction={(action) => actions.request(action, [entry])}
                />
              )}
            />
            <nav
              aria-label="Pagination"
              className="text-muted-foreground mt-4 flex items-center justify-between gap-3 text-sm"
            >
              <p>
                {first}–{last} of {list.total}
              </p>
              <div className="flex items-center gap-2">
                <PageLink
                  href={listHref(pathname, params, { page: list.page - 1 })}
                  disabled={list.page <= 1}
                  label="Previous page"
                >
                  <ChevronLeft aria-hidden /> Previous
                </PageLink>
                <span className="hidden sm:inline">
                  Page {list.page} of {list.pageCount}
                </span>
                <PageLink
                  href={listHref(pathname, params, { page: list.page + 1 })}
                  disabled={list.page >= list.pageCount}
                  label="Next page"
                >
                  Next <ChevronRight aria-hidden />
                </PageLink>
              </div>
            </nav>
          </>
        )}
      </div>
      {actions.dialog}
    </div>
  );
}

function StatusFilters({
  counts,
  current,
  hrefFor,
}: {
  counts: EntryList["counts"];
  current: StatusFilter;
  hrefFor: (status: StatusFilter) => string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const fade = useOverflowFade(ref);
  const active = CONTENT_STATUSES.filter((s) => s !== "archived").reduce(
    (sum, s) => sum + counts[s],
    0,
  );
  const filters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "active", label: "All", count: active },
    ...CONTENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], count: counts[s] })),
  ];

  return (
    <nav aria-label="Filter by status">
      <ul
        ref={ref}
        onScroll={fade.onScroll}
        style={fade.style}
        className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {filters.map((filter) => {
          const isCurrent = filter.value === current;
          return (
            <li key={filter.value} className="shrink-0">
              <Link
                href={hrefFor(filter.value)}
                replace
                scroll={false}
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px]",
                  isCurrent
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {filter.label}
                <span className={cn("text-xs tabular-nums", !isCurrent && "text-muted-foreground")}>
                  {filter.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BulkBar({
  count,
  counts,
  pending,
  onAction,
  onClear,
}: {
  count: number;
  counts: Record<BulkAction, number>;
  pending: boolean;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
}) {
  const label = (base: string, n: number) => (n === count ? base : `${base} (${n})`);
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="bg-background sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-xl border p-2 pl-3 shadow-sm"
    >
      <p className="mr-auto text-sm font-medium">
        {count} selected
        {pending && <Loader2 className="ml-2 inline size-4 animate-spin" aria-label="Working" />}
      </p>
      {counts.archive > 0 && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onAction("archive")}>
          <Archive aria-hidden /> {label("Archive", counts.archive)}
        </Button>
      )}
      {counts.restore > 0 && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => onAction("restore")}>
          <ArchiveRestore aria-hidden /> {label("Restore", counts.restore)}
        </Button>
      )}
      {counts.delete > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onAction("delete")}
          className="text-destructive"
        >
          <Trash2 aria-hidden /> {label("Delete", counts.delete)}
        </Button>
      )}
      {counts.archive + counts.restore + counts.delete === 0 && (
        <p className="text-muted-foreground text-sm">You can&apos;t change the selected items.</p>
      )}
      <Button size="icon-sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
        <X aria-hidden />
      </Button>
    </div>
  );
}

function RowMenu({
  entry,
  siteId,
  permitted,
  onAction,
}: {
  entry: EntrySummary;
  siteId: string;
  permitted: Record<BulkAction, boolean>;
  onAction: (action: BulkAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.title}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`${siteHref(siteId, "content")}/${entry.id}`}>
            <FileText aria-hidden /> Open
          </Link>
        </DropdownMenuItem>
        {(permitted.archive || permitted.restore || permitted.delete) && <DropdownMenuSeparator />}
        {permitted.archive && (
          <DropdownMenuItem onSelect={() => onAction("archive")}>
            <Archive aria-hidden /> Archive
          </DropdownMenuItem>
        )}
        {permitted.restore && (
          <DropdownMenuItem onSelect={() => onAction("restore")}>
            <ArchiveRestore aria-hidden /> Restore as draft
          </DropdownMenuItem>
        )}
        {permitted.delete && (
          <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete")}>
            <Trash2 aria-hidden /> Delete permanently
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectBox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="accent-primary size-4 cursor-pointer"
    />
  );
}

function entryHref(siteId: string, entry: EntrySummary) {
  return `${siteHref(siteId, "content")}/${entry.id}`;
}

function UpdatedCell({ entry }: { entry: EntrySummary }) {
  return <time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time>;
}

function StatusCell({ entry, today }: { entry: EntrySummary; today: string }) {
  const overdue = isOverdue(entry, today);
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <ContentStatusBadge status={entry.status} />
      {entry.status === "scheduled" && entry.scheduledAt && (
        <span className="text-muted-foreground text-xs">
          for <time dateTime={entry.scheduledAt}>{formatDate(entry.scheduledAt)}</time>
        </span>
      )}
      {entry.assigneeId && (
        <span className="text-muted-foreground flex max-w-full items-center gap-1 text-xs">
          <UserRound className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">Assigned to</span>
          <span className="truncate">{entry.assigneeName ?? "Former member"}</span>
        </span>
      )}
      {entry.dueOn && entry.status !== "published" && entry.status !== "archived" && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            overdue ? "text-warning" : "text-muted-foreground",
          )}
        >
          <CalendarClock className="size-3 shrink-0" aria-hidden />
          {overdue ? "Overdue: " : "Due "}
          {formatDue(entry.dueOn)}
        </span>
      )}
    </span>
  );
}

function EntryTable({
  siteId,
  entries,
  showType,
  today,
  pathOf,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  rowActions,
}: {
  siteId: string;
  entries: EntrySummary[];
  showType: boolean;
  today: string;
  pathOf: (entry: EntrySummary) => string;
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  rowActions: (entry: EntrySummary) => React.ReactNode;
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border md:block">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-10" />
          <col />
          {showType && <col className="w-24" />}
          <col className="w-36" />
          <col className="hidden w-40 lg:table-column" />
          <col className="w-32" />
          <col className="w-14" />
        </colgroup>
        <thead className="bg-muted/60 text-muted-foreground text-left text-xs">
          <tr>
            <th scope="col" className="w-10 py-2.5 pl-4">
              <SelectBox
                checked={allSelected}
                indeterminate={!allSelected && selected.size > 0}
                onChange={onToggleAll}
                label="Select all on this page"
              />
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Title
            </th>
            {showType && (
              <th scope="col" className="px-3 py-2.5 font-medium">
                Type
              </th>
            )}
            <th scope="col" className="px-3 py-2.5 font-medium">
              Status
            </th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">
              Author
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium whitespace-nowrap">
              Updated
            </th>
            <th scope="col" className="w-12 py-2.5 pr-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={cn(
                "hover:bg-muted/40 transition-colors",
                selected.has(entry.id) && "bg-primary/5 hover:bg-primary/5",
              )}
            >
              <td className="py-3 pl-4 align-top">
                <SelectBox
                  checked={selected.has(entry.id)}
                  onChange={() => onToggle(entry.id)}
                  label={`Select ${entry.title}`}
                />
              </td>
              <td className="px-3 py-2.5 align-top">
                <Link
                  href={entryHref(siteId, entry)}
                  className="focus-visible:ring-ring/50 block truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-[3px]"
                >
                  {entry.title}
                </Link>
                <p className="text-muted-foreground truncate font-mono text-xs">{pathOf(entry)}</p>
              </td>
              {showType && (
                <td className="text-muted-foreground px-3 py-3 align-top whitespace-nowrap">
                  {entry.modelName}
                </td>
              )}
              <td className="px-3 py-3 align-top">
                <StatusCell entry={entry} today={today} />
              </td>
              <td className="text-muted-foreground hidden truncate px-3 py-3 align-top lg:table-cell">
                {entry.authorName ?? "—"}
              </td>
              <td className="text-muted-foreground px-3 py-3 align-top whitespace-nowrap tabular-nums">
                <UpdatedCell entry={entry} />
              </td>
              <td className="py-2 pr-3 text-right align-top">{rowActions(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryCards({
  siteId,
  entries,
  showType,
  today,
  pathOf,
  selected,
  onToggle,
  rowActions,
}: {
  siteId: string;
  entries: EntrySummary[];
  showType: boolean;
  today: string;
  pathOf: (entry: EntrySummary) => string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  rowActions: (entry: EntrySummary) => React.ReactNode;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border md:hidden">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={cn("flex gap-3 py-3 pr-2 pl-4", selected.has(entry.id) && "bg-primary/5")}
        >
          <div className="pt-0.5">
            <SelectBox
              checked={selected.has(entry.id)}
              onChange={() => onToggle(entry.id)}
              label={`Select ${entry.title}`}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Link
              href={entryHref(siteId, entry)}
              className="focus-visible:ring-ring/50 rounded-sm font-medium outline-none focus-visible:ring-[3px]"
            >
              {entry.title}
            </Link>
            <p className="text-muted-foreground truncate font-mono text-xs">{pathOf(entry)}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusCell entry={entry} today={today} />
              <span className="text-muted-foreground text-xs">
                {showType && `${entry.modelName} · `}
                {entry.authorName ? `${entry.authorName} · ` : ""}
                <UpdatedCell entry={entry} />
              </span>
            </div>
          </div>
          <div>{rowActions(entry)}</div>
        </li>
      ))}
    </ul>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href} aria-label={label} replace>
        {children}
      </Link>
    </Button>
  );
}
