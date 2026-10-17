import type { Metadata } from "next";
import { FileText, Newspaper, PenLine } from "lucide-react";
import { EntryActionsMenu } from "@/components/content/entry-actions-menu";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { STATUS_LABELS } from "@/lib/content";
import { getEntry } from "@/lib/data/content";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { formatDate } from "@/lib/format";
import { siteHref } from "@/lib/navigation";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[siteId]/content/[entryId]">): Promise<Metadata> {
  const { siteId, entryId } = await params;
  return { title: (await getEntry(siteId, entryId)).title };
}

const EDITOR_PLANNED = [
  "Title and body content",
  "URL slug",
  "SEO title and description",
  "Social preview",
  "Schema",
  "Preview",
  "Publishing and scheduling",
];

export default async function EntryPage({
  params,
}: PageProps<"/sites/[siteId]/content/[entryId]">) {
  const { siteId, entryId } = await params;
  const [user, site, entry] = await Promise.all([
    requireUser(),
    getSite(siteId),
    getEntry(siteId, entryId),
  ]);

  const listSegment = !entry.isSystemModel
    ? "collections"
    : entry.modelKey === "page"
      ? "pages"
      : "posts";
  const listLabel = !entry.isSystemModel
    ? "Collections"
    : entry.modelKey === "page"
      ? "Pages"
      : "Posts";
  const contentHref = siteHref(site.id, "content");

  const details: { term: string; value: React.ReactNode }[] = [
    { term: "Type", value: entry.modelName },
    { term: "Status", value: <ContentStatusBadge status={entry.status} /> },
    {
      term: "URL slug",
      value: <span className="font-mono text-sm break-all">/{entry.slug}</span>,
    },
    { term: "Author", value: entry.authorName ?? "Former member" },
    {
      term: "Created",
      value: <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>,
    },
    {
      term: "Last updated",
      value: <time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time>,
    },
    {
      term: entry.status === "scheduled" ? "Scheduled for" : "First published",
      value:
        entry.status === "scheduled" && entry.scheduledAt ? (
          <time dateTime={entry.scheduledAt}>{formatDate(entry.scheduledAt)}</time>
        ) : entry.publishedAt ? (
          <time dateTime={entry.publishedAt}>{formatDate(entry.publishedAt)}</time>
        ) : (
          "Not yet"
        ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={entry.modelKey === "post" ? Newspaper : FileText}
        title={entry.title}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: site.name, href: siteHref(site.id) },
              { label: "Content", href: contentHref },
              { label: listLabel, href: `${contentHref}/${listSegment}` },
              { label: entry.title },
            ]}
          />
        }
        actions={
          <EntryActionsMenu
            siteId={site.id}
            role={site.currentUserRole}
            userId={user.id}
            entry={entry}
          />
        }
      />
      <div className="grid gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="editor-heading"
          className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-5 sm:p-6"
        >
          <span
            aria-hidden
            className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-xl"
          >
            <PenLine className="size-5" />
          </span>
          <h2 id="editor-heading" className="text-base font-semibold">
            The editor is the next step
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm">
            This {entry.modelName.toLowerCase()} exists and is saved as{" "}
            {entry.status === "draft" ? "a draft" : `“${STATUS_LABELS[entry.status]}”`}. Writing and
            editing its content will be possible once the editor is built. It will include:
          </p>
          <ul className="flex flex-wrap gap-2">
            {EDITOR_PLANNED.map((item) => (
              <li
                key={item}
                className="text-muted-foreground rounded-md border px-2.5 py-1 text-xs"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="details-heading" className="rounded-2xl border p-5">
          <h2 id="details-heading" className="mb-4 text-base font-semibold">
            Details
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
            {details.map((row) => (
              <div key={row.term} className="contents">
                <dt className="text-muted-foreground">{row.term}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
