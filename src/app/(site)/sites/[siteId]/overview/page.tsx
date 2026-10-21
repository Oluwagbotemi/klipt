import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  EyeOff,
  CircleCheck,
  Circle,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  PenLine,
  Search,
  Send,
  Webhook,
} from "lucide-react";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { QuickActions } from "@/components/overview/quick-actions";
import { getOverview } from "@/lib/data/overview";
import { getSite } from "@/lib/data/sites";
import { formatDate, formatDateTime } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import { activityVerb, type OverviewEntry, type SetupStep } from "@/lib/overview";
import { PAGE_ISSUES } from "@/lib/seo-audit";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const card = "bg-card rounded-2xl border";

export default async function OverviewPage({ params }: PageProps<"/sites/[siteId]/overview">) {
  const { siteId } = await params;
  const [site, overview] = await Promise.all([getSite(siteId), getOverview(siteId)]);
  const role = site.currentUserRole;
  const content = siteHref(site.id, "content");
  const entryHref = (id: string) => `${content}/${id}`;
  const canPublish = can(role, "content.publish");

  const stats = [
    {
      label: "Published",
      value: overview.counts.published,
      href: `${content}?status=published`,
      icon: Send,
    },
    {
      label: "Drafts",
      value: overview.counts.draft,
      href: `${content}?status=draft`,
      icon: PenLine,
    },
    {
      label: "In review",
      value: overview.counts.in_review,
      href: `${content}?status=in_review`,
      icon: ClipboardCheck,
    },
    {
      label: "Scheduled",
      value: overview.counts.scheduled,
      href: `${content}?status=scheduled`,
      icon: CalendarClock,
    },
    {
      label: "Media files",
      value: overview.media.total,
      href: siteHref(site.id, "media"),
      icon: ImageIcon,
    },
  ];

  const attention = [
    ...(!overview.allowIndexing
      ? [
          {
            key: "hidden",
            icon: EyeOff,
            tone: "destructive" as const,
            title: "The whole site is hidden from search engines",
            why: "Search visibility is turned off, so none of your pages should appear in search results.",
            href: siteHref(site.id, "seo", "indexing"),
            action: "Review setting",
          },
        ]
      : []),
    ...(overview.webhookFailures
      ? [
          {
            key: "webhooks",
            icon: Webhook,
            tone: "destructive" as const,
            title: `${overview.webhookFailures} webhook ${overview.webhookFailures === 1 ? "message" : "messages"} failed this week`,
            why: "Your website may be showing outdated content.",
            href: siteHref(site.id, "settings", "integrations"),
            action: "Check webhooks",
          },
        ]
      : []),
    ...(canPublish && overview.counts.in_review
      ? [
          {
            key: "review",
            icon: ClipboardCheck,
            tone: "warning" as const,
            title: `${overview.counts.in_review} waiting for review`,
            why: "Authors are waiting for someone to publish or send back their work.",
            href: `${content}?status=in_review`,
            action: "Review",
          },
        ]
      : []),
    ...(overview.media.missingAlt
      ? [
          {
            key: "alt",
            icon: ImageIcon,
            tone: "warning" as const,
            title: `${overview.media.missingAlt} ${overview.media.missingAlt === 1 ? "image has" : "images have"} no alt text`,
            why: "Screen readers and search engines rely on it to understand images.",
            href: `${siteHref(site.id, "media")}?alt=missing`,
            action: "Add alt text",
          },
        ]
      : []),
  ];

  const setupOpen = overview.setup?.some((step) => !step.done);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">
      <QuickActions
        siteId={site.id}
        canCreate={can(role, "content.create")}
        canUpload={can(role, "media.upload")}
        canIntegrate={can(role, "api_keys.manage")}
      />

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Content at a glance
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat) => (
            <li key={stat.label}>
              <Link
                href={stat.href}
                className={cn(
                  card,
                  "hover:bg-accent/40 focus-visible:ring-ring/50 flex h-full flex-col gap-2 p-4 outline-none focus-visible:ring-[3px]",
                )}
              >
                <span className="text-muted-foreground flex items-center gap-2 text-sm">
                  <stat.icon className="size-4" aria-hidden />
                  {stat.label}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-labelledby="attention-heading" className={cn(card, "lg:col-span-2")}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <h2 id="attention-heading" className="text-base font-semibold">
              Needs attention
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Suggestions from your own content. They never block publishing and don&apos;t
              guarantee rankings.
            </p>
          </div>
          {attention.length === 0 && overview.seoIssues.length === 0 ? (
            <p className="flex items-center gap-2 border-t px-5 py-6 text-sm sm:px-6">
              <CircleCheck className="text-success size-5" aria-hidden />
              {overview.publishedCount === 0
                ? "Nothing to check yet. Issues will show here once you publish."
                : "Nothing needs attention right now."}
            </p>
          ) : (
            <ul className="divide-y border-t">
              {attention.map((item) => (
                <li key={item.key} className="flex items-start gap-3 px-5 py-4 sm:px-6">
                  <item.icon
                    className={cn(
                      "mt-0.5 size-5 shrink-0",
                      item.tone === "destructive" ? "text-destructive" : "text-warning",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-sm">{item.why}</p>
                  </div>
                  <Link
                    href={item.href}
                    className="text-primary shrink-0 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {item.action}
                  </Link>
                </li>
              ))}
              {overview.seoIssues.map((issue) => (
                <li key={issue.key} className="flex items-start gap-3 px-5 py-4 sm:px-6">
                  <Search className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {PAGE_ISSUES[issue.key].title}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {issue.count} of {overview.publishedCount} live
                      </span>
                    </p>
                    <p className="text-muted-foreground text-sm">{PAGE_ISSUES[issue.key].why}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {issue.examples.map((example) => (
                        <li key={example.id} className="min-w-0">
                          <Link
                            href={entryHref(example.id)}
                            className="text-primary block max-w-64 truncate underline-offset-4 hover:underline"
                          >
                            {example.title}
                          </Link>
                        </li>
                      ))}
                      {issue.count > issue.examples.length && (
                        <li className="text-muted-foreground">
                          and {issue.count - issue.examples.length} more
                        </li>
                      )}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          {setupOpen && overview.setup && (
            <SetupChecklist siteId={site.id} steps={overview.setup} />
          )}
          <section aria-labelledby="upcoming-heading" className={card}>
            <h2 id="upcoming-heading" className="p-5 pb-3 text-base font-semibold sm:px-6">
              Scheduled
            </h2>
            {overview.upcoming.length === 0 ? (
              <p className="text-muted-foreground border-t px-5 py-5 text-sm sm:px-6">
                Nothing scheduled. Use Publish › Schedule in the editor to publish later.
              </p>
            ) : (
              <ul className="divide-y border-t">
                {overview.upcoming.map((entry) => (
                  <li key={entry.id} className="px-5 py-3 sm:px-6">
                    <Link
                      href={entryHref(entry.id)}
                      className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {entry.title || "Untitled"}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {entry.scheduledAt && (
                        <time dateTime={entry.scheduledAt}>
                          {formatDateTime(entry.scheduledAt)}
                        </time>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-labelledby="recent-heading" className={cn(card, "lg:col-span-2")}>
          <div className="flex items-center justify-between gap-3 p-5 pb-3 sm:px-6">
            <h2 id="recent-heading" className="text-base font-semibold">
              Recently edited
            </h2>
            <Link
              href={content}
              className="text-primary text-sm font-medium underline-offset-4 hover:underline"
            >
              All content
            </Link>
          </div>
          {overview.recent.length === 0 ? (
            <p className="text-muted-foreground border-t px-5 py-5 text-sm sm:px-6">
              No content yet. Create your first post or page above.
            </p>
          ) : (
            <ul className="divide-y border-t">
              {overview.recent.map((entry) => (
                <RecentRow key={entry.id} entry={entry} href={entryHref(entry.id)} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="activity-heading" className={card}>
          <div className="flex items-baseline justify-between gap-3 p-5 pb-3 sm:px-6">
            <h2 id="activity-heading" className="text-base font-semibold">
              Activity
            </h2>
            {can(site.currentUserRole, "activity.view") && (
              <Link
                href={siteHref(site.id, "team", "activity")}
                className="text-primary text-sm underline-offset-4 hover:underline"
              >
                View all
              </Link>
            )}
          </div>
          {overview.activity.length === 0 ? (
            <p className="text-muted-foreground border-t px-5 py-5 text-sm sm:px-6">
              Changes your team makes will appear here.
            </p>
          ) : (
            <ol className="divide-y border-t">
              {overview.activity.map((item) => (
                <li key={item.id} className="px-5 py-3 text-sm sm:px-6">
                  <p className="min-w-0 break-words">
                    <span className="font-medium">{item.actorName ?? "Someone"}</span>{" "}
                    {activityVerb(item.action)}{" "}
                    {item.targetTitle &&
                      (item.entryId ? (
                        <Link
                          href={entryHref(item.entryId)}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.targetTitle}
                        </Link>
                      ) : (
                        <span className="font-medium">{item.targetTitle}</span>
                      ))}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function RecentRow({ entry, href }: { entry: OverviewEntry; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-accent/40 focus-visible:ring-ring/50 flex items-center gap-3 px-5 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
      >
        <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{entry.title || "Untitled"}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {entry.path}
            {entry.authorName ? ` · ${entry.authorName}` : ""}
          </span>
        </span>
        <span className="hidden sm:inline-flex">
          <ContentStatusBadge status={entry.status} />
        </span>
        <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-xs md:block">
          {formatDate(entry.updatedAt)}
        </span>
      </Link>
    </li>
  );
}

const SETUP_TEXT: Record<
  SetupStep["key"],
  { label: string; section: "content" | "media" | "settings" }
> = {
  publish: { label: "Publish your first post or page", section: "content" },
  media: { label: "Upload an image to the media library", section: "media" },
  api_key: { label: "Create an API key for your website", section: "settings" },
  webhook: { label: "Add a webhook so your website updates instantly", section: "settings" },
};

function SetupChecklist({ siteId, steps }: { siteId: string; steps: SetupStep[] }) {
  const done = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby="setup-heading" className={card}>
      <div className="p-5 pb-3 sm:px-6">
        <h2 id="setup-heading" className="text-base font-semibold">
          Get set up
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {done} of {steps.length} done
        </p>
        <div
          className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
        >
          <div
            className="bg-primary h-full rounded-full"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ul className="divide-y border-t">
        {steps.map((step) => {
          const { label, section } = SETUP_TEXT[step.key];
          const href =
            section === "settings"
              ? siteHref(siteId, "settings", "integrations")
              : siteHref(siteId, section);
          return (
            <li key={step.key}>
              {step.done ? (
                <p className="text-muted-foreground flex items-center gap-3 px-5 py-3 text-sm line-through sm:px-6">
                  <CircleCheck className="text-success size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="sr-only">Done: </span>
                    {label}
                  </span>
                </p>
              ) : (
                <Link
                  href={href}
                  className="hover:bg-accent/40 focus-visible:ring-ring/50 flex items-center gap-3 px-5 py-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-6"
                >
                  <Circle className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
