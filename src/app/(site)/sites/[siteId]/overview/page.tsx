import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity as ActivityIcon,
  CalendarClock,
  ClipboardCheck,
  CircleCheck,
  Clock,
  Circle,
  EyeOff,
  FileText,
  Globe,
  Image as ImageIcon,
  PenLine,
  Rocket,
  Search,
  Send,
  Sparkles,
  Webhook,
} from "lucide-react";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { Greeting } from "@/components/overview/greeting";
import { PerformanceCard } from "@/components/overview/performance-card";
import { PublishingCard } from "@/components/overview/publishing-card";
import { HeroCreateButton, QuickActions } from "@/components/overview/quick-actions";
import { SeoHealthCard } from "@/components/overview/seo-health-card";
import { WorkCard } from "@/components/overview/work-card";
import { AreaChart } from "@/components/visual/area-chart";
import { CardHeader, IconTile, VisualCard, type IconTone } from "@/components/visual/card";
import { heroActionClass, HeroCard } from "@/components/visual/hero-card";
import { Illustration } from "@/components/visual/illustration";
import { InfoChip } from "@/components/visual/info-chip";
import { PillTabs } from "@/components/visual/pill-tabs";
import { ProgressBar } from "@/components/visual/progress-bar";
import { StatCard } from "@/components/visual/stat-card";
import { getOverview } from "@/lib/data/overview";
import { getPerformanceSummary } from "@/lib/data/performance";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { formatDate, formatDateTime } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import {
  activityVerb,
  DEFAULT_OVERVIEW_PERIOD,
  OVERVIEW_PERIODS,
  parseOverviewPeriod,
  type OverviewEntry,
  type SetupStep,
  type SiteOverview,
} from "@/lib/overview";
import { can } from "@/lib/permissions";
import { PAGE_ISSUES } from "@/lib/seo-audit";
import { cn, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({
  params,
  searchParams,
}: PageProps<"/sites/[siteId]/overview">) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const period = parseOverviewPeriod(query.period);
  const [site, overview, user] = await Promise.all([
    getSite(siteId),
    getOverview(siteId, period),
    requireUser(),
  ]);
  const role = site.currentUserRole;
  const performance = can(role, "performance.view") ? await getPerformanceSummary(site.id) : null;
  const content = siteHref(site.id, "content");
  const entryHref = (id: string) => `${content}/${id}`;
  const canPublish = can(role, "content.publish");
  const canCreate = can(role, "content.create");
  const setupOpen = overview.setup?.some((step) => !step.done);

  return (
    <div className="bg-canvas flex flex-1 flex-col md:rounded-b-3xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:gap-5 sm:px-8 sm:py-8">
        {/* Greeting, status and the period that scopes everything below. */}
        <section
          aria-labelledby="greeting-heading"
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div className="flex min-w-0 flex-col gap-3">
            <h2
              id="greeting-heading"
              className="text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2rem]"
            >
              <Greeting firstName={user.name.split(/\s+/)[0] ?? ""} />
            </h2>
            <div className="flex flex-wrap gap-2">
              {overview.allowIndexing ? (
                <InfoChip tone="success" icon={Search}>
                  Visible to search engines
                </InfoChip>
              ) : (
                <InfoChip tone="danger" icon={EyeOff}>
                  Hidden from search engines
                </InfoChip>
              )}
              <InfoChip icon={Globe}>{site.domain ?? "No domain yet"}</InfoChip>
              <InfoChip tone="accent" icon={Send}>
                {overview.counts.published} live{" "}
                {overview.counts.published === 1 ? "page" : "pages"}
              </InfoChip>
            </div>
          </div>
          <PillTabs
            label="Period"
            param="period"
            value={`${period}d`}
            defaultValue={`${DEFAULT_OVERVIEW_PERIOD}d`}
            options={OVERVIEW_PERIODS.map((days) => ({
              value: `${days}d`,
              label: `${days}D`,
              description: `Last ${days} days`,
            }))}
          />
        </section>

        <QuickActions
          siteId={site.id}
          canCreate={canCreate}
          canUpload={can(role, "media.upload")}
          canIntegrate={can(role, "api_keys.manage")}
        />

        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="sr-only">
            Content at a glance
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <li className="min-w-0">
              <StatCard
                label="Published"
                value={overview.counts.published}
                icon={Send}
                iconTone="accent"
                href={`${content}?status=published`}
                caption={`${overview.publishing.thisPeriod} new in ${period} days`}
                chart={
                  overview.publishing.thisPeriod > 0 ? (
                    <AreaChart
                      variant="sparkline"
                      height={36}
                      title="Publications per day"
                      points={overview.publishing.daily.map((day) => ({
                        key: day.day,
                        label: day.day,
                        value: day.count,
                      }))}
                    />
                  ) : (
                    <ShareOfEntries
                      value={overview.counts.published}
                      overview={overview}
                      label="Published"
                    />
                  )
                }
              />
            </li>
            <li className="min-w-0">
              <StatCard
                label="Drafts"
                value={overview.counts.draft}
                icon={PenLine}
                href={`${content}?status=draft`}
                caption={
                  overview.myWork?.total
                    ? `${overview.myWork.total} assigned to you`
                    : "Work in progress"
                }
                chart={
                  <ShareOfEntries
                    value={overview.counts.draft}
                    overview={overview}
                    label="Drafts"
                  />
                }
              />
            </li>
            <li className="min-w-0">
              <StatCard
                label="In review"
                value={overview.counts.in_review}
                icon={ClipboardCheck}
                iconTone={overview.counts.in_review ? "warning" : "neutral"}
                href={`${content}?status=in_review`}
                caption={overview.counts.in_review ? "Waiting for a reviewer" : "Nothing waiting"}
                chart={
                  <ShareOfEntries
                    value={overview.counts.in_review}
                    overview={overview}
                    label="In review"
                    tone="warning"
                  />
                }
              />
            </li>
            <li className="min-w-0">
              <StatCard
                label="Scheduled"
                value={overview.counts.scheduled}
                icon={CalendarClock}
                href={`${content}?status=scheduled`}
                caption={
                  overview.upcoming[0]?.scheduledAt
                    ? `Next on ${formatDate(overview.upcoming[0].scheduledAt)}`
                    : "Nothing planned"
                }
                chart={
                  <ShareOfEntries
                    value={overview.counts.scheduled}
                    overview={overview}
                    label="Scheduled"
                  />
                }
              />
            </li>
          </ul>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
          <PublishingCard
            activity={overview.publishing}
            period={period}
            href={`${content}?status=published`}
          />
          <NextUpCard
            siteId={site.id}
            overview={overview}
            canPublish={canPublish}
            canCreate={canCreate}
            entryHref={entryHref}
            content={content}
          />

          <AttentionCard
            siteId={site.id}
            overview={overview}
            canPublish={canPublish}
            entryHref={entryHref}
          />
          <SeoHealthCard
            live={overview.seoHealth.live}
            healthy={overview.seoHealth.healthy}
            allowIndexing={overview.allowIndexing}
            href={siteHref(site.id, "seo")}
          />

          <RecentCard entries={overview.recent} content={content} entryHref={entryHref} />
          <ActivityCard
            overview={overview}
            entryHref={entryHref}
            allHref={can(role, "activity.view") ? siteHref(site.id, "team", "activity") : null}
          />
        </div>

        {(setupOpen || performance || overview.myWork) && (
          <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
            {setupOpen && overview.setup && <SetupCard siteId={site.id} steps={overview.setup} />}
            {overview.myWork && (
              <WorkCard
                work={overview.myWork}
                entryHref={entryHref}
                boardHref={siteHref(site.id, "team", "assignments")}
              />
            )}
            {performance && <PerformanceCard siteId={site.id} summary={performance} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** A stat's share of all current entries (archived ones aside), as a small bar with ticks. */
function ShareOfEntries({
  value,
  overview,
  label,
  tone = "accent",
}: {
  value: number;
  overview: SiteOverview;
  label: string;
  tone?: "accent" | "warning";
}) {
  const { published, draft, in_review, scheduled } = overview.counts;
  const total = published + draft + in_review + scheduled;
  return (
    <div className="flex flex-col gap-1.5">
      <ProgressBar
        value={value}
        max={total}
        tone={tone}
        label={`${label}: ${value} of ${total} entries`}
        className="h-2"
      />
      <span className="text-muted-foreground text-[11px]">
        {value} of {total} entries
      </span>
    </div>
  );
}

/** "In 3 days", "In 5 hours", "Any minute now". Rendered per request. */
function timeUntil(iso: string) {
  const hours = (Date.parse(iso) - Date.now()) / 3_600_000;
  if (hours < 1) return "Any minute now";
  if (hours < 24) return `In ${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

/** The one dark highlight: what's next for this member. */
function NextUpCard({
  siteId,
  overview,
  canPublish,
  canCreate,
  entryHref,
  content,
}: {
  siteId: string;
  overview: SiteOverview;
  canPublish: boolean;
  canCreate: boolean;
  entryHref: (id: string) => string;
  content: string;
}) {
  const next = overview.upcoming[0];
  const className = "lg:col-span-4";
  if (next?.scheduledAt) {
    return (
      <HeroCard
        id="next-heading"
        className={className}
        eyebrow="Next up"
        eyebrowIcon={Rocket}
        title={next.title || "Untitled"}
        description={
          <>
            Publishes <time dateTime={next.scheduledAt}>{formatDateTime(next.scheduledAt)}</time>
          </>
        }
        meta={
          <>
            <InfoChip tone="hero" icon={Clock}>
              {timeUntil(next.scheduledAt)}
            </InfoChip>
            {overview.counts.scheduled > 1 && (
              <InfoChip tone="hero" icon={CalendarClock}>
                {overview.counts.scheduled - 1} more scheduled
              </InfoChip>
            )}
          </>
        }
      >
        <Link href={entryHref(next.id)} className={heroActionClass()}>
          Open post
        </Link>
        <Link href={`${content}?status=scheduled`} className={heroActionClass("secondary")}>
          All scheduled
        </Link>
      </HeroCard>
    );
  }
  if (canPublish && overview.counts.in_review > 0) {
    return (
      <HeroCard
        id="next-heading"
        className={className}
        eyebrow="Waiting for you"
        eyebrowIcon={ClipboardCheck}
        title={`${overview.counts.in_review} waiting for review`}
        description="Authors are waiting for someone to publish or send back their work."
      >
        <Link href={`${content}?status=in_review`} className={heroActionClass()}>
          Review now
        </Link>
      </HeroCard>
    );
  }
  if (canCreate) {
    return (
      <HeroCard
        id="next-heading"
        className={className}
        eyebrow="Your next story"
        eyebrowIcon={Sparkles}
        title="Nothing scheduled yet"
        description="Write something new, or schedule a draft to keep your site fresh."
      >
        <HeroCreateButton siteId={siteId} className={heroActionClass()} />
        <Link href={`${content}?status=draft`} className={heroActionClass("secondary")}>
          Drafts
        </Link>
      </HeroCard>
    );
  }
  return (
    <HeroCard
      id="next-heading"
      className={className}
      eyebrow="Live now"
      eyebrowIcon={Send}
      title={`${overview.counts.published} live ${overview.counts.published === 1 ? "page" : "pages"}`}
      description="Everything your team has published on this site."
    >
      <Link href={content} className={heroActionClass()}>
        Browse content
      </Link>
    </HeroCard>
  );
}

function AttentionCard({
  siteId,
  overview,
  canPublish,
  entryHref,
}: {
  siteId: string;
  overview: SiteOverview;
  canPublish: boolean;
  entryHref: (id: string) => string;
}) {
  const content = siteHref(siteId, "content");
  const attention: {
    key: string;
    icon: typeof EyeOff;
    tone: IconTone;
    title: string;
    why: string;
    href: string;
    action: string;
  }[] = [
    ...(!overview.allowIndexing
      ? [
          {
            key: "hidden",
            icon: EyeOff,
            tone: "danger" as const,
            title: "The whole site is hidden from search engines",
            why: "Search visibility is turned off, so none of your pages should appear in search results.",
            href: siteHref(siteId, "seo", "indexing"),
            action: "Review setting",
          },
        ]
      : []),
    ...(overview.webhookFailures
      ? [
          {
            key: "webhooks",
            icon: Webhook,
            tone: "danger" as const,
            title: `${overview.webhookFailures} webhook ${overview.webhookFailures === 1 ? "message" : "messages"} failed this week`,
            why: "Your website may be showing outdated content.",
            href: siteHref(siteId, "settings", "integrations"),
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
            href: `${siteHref(siteId, "media")}?alt=missing`,
            action: "Add alt text",
          },
        ]
      : []),
  ];
  const empty = attention.length === 0 && overview.seoIssues.length === 0;

  return (
    <VisualCard aria-labelledby="attention-heading" className="lg:col-span-8">
      <CardHeader
        id="attention-heading"
        title="Needs attention"
        description="Suggestions from your own content. They never block publishing and don't guarantee rankings."
        icon={Sparkles}
        iconTone="warning"
      />
      {empty ? (
        <div className="flex flex-col items-center gap-3 px-5 pb-8 text-center sm:px-6">
          <Illustration scene="success" />
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleCheck className="text-success size-4" aria-hidden />
            {overview.publishedCount === 0
              ? "Nothing to check yet. Issues will show here once you publish."
              : "Nothing needs attention right now."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
          {attention.map((item) => (
            <li key={item.key} className="visual-nested flex items-start gap-3 p-3 sm:p-4">
              <IconTile icon={item.icon} tone={item.tone} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-muted-foreground text-sm">{item.why}</p>
              </div>
              <Link
                href={item.href}
                className="bg-card hover:bg-accent focus-visible:ring-ring/50 shadow-card shrink-0 rounded-full px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-[3px]"
              >
                {item.action}
              </Link>
            </li>
          ))}
          {overview.seoIssues.map((issue) => (
            <li key={issue.key} className="visual-nested flex items-start gap-3 p-3 sm:p-4">
              <IconTile icon={Search} tone="info" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {PAGE_ISSUES[issue.key].title}{" "}
                  <span className="text-muted-foreground font-normal">
                    · {issue.count} of {overview.publishedCount} live
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">{PAGE_ISSUES[issue.key].why}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
                  {issue.examples.map((example) => (
                    <li key={example.id} className="min-w-0">
                      <Link
                        href={entryHref(example.id)}
                        className="bg-card hover:bg-accent text-primary-strong block max-w-64 truncate rounded-full px-2.5 py-1 text-xs font-medium underline-offset-4 hover:underline"
                      >
                        {example.title}
                      </Link>
                    </li>
                  ))}
                  {issue.count > issue.examples.length && (
                    <li className="text-muted-foreground px-1 py-1 text-xs">
                      and {issue.count - issue.examples.length} more
                    </li>
                  )}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </VisualCard>
  );
}

function RecentCard({
  entries,
  content,
  entryHref,
}: {
  entries: OverviewEntry[];
  content: string;
  entryHref: (id: string) => string;
}) {
  return (
    <VisualCard aria-labelledby="recent-heading" className="lg:col-span-8">
      <CardHeader
        id="recent-heading"
        title="Recently edited"
        icon={FileText}
        iconTone="neutral"
        href={content}
        hrefLabel="All content"
      />
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 pb-8 text-center sm:px-6">
          <Illustration scene="content" />
          <p className="text-muted-foreground text-sm">
            No content yet. Create your first post or page above.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col px-2 pb-3 sm:px-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={entryHref(entry.id)}
                className="hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-3 rounded-2xl px-3 py-2.5 outline-none focus-visible:ring-[3px]"
              >
                <IconTile
                  icon={entry.modelKey === "page" ? FileText : PenLine}
                  tone="neutral"
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {entry.title || "Untitled"}
                  </span>
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
          ))}
        </ul>
      )}
    </VisualCard>
  );
}

function ActivityCard({
  overview,
  entryHref,
  allHref,
}: {
  overview: SiteOverview;
  entryHref: (id: string) => string;
  allHref: string | null;
}) {
  return (
    <VisualCard aria-labelledby="activity-heading" className="lg:col-span-4">
      <CardHeader
        id="activity-heading"
        title="Activity"
        icon={ActivityIcon}
        iconTone="info"
        action={
          allHref ? (
            <Link
              href={allHref}
              className="text-primary-strong self-center text-sm font-medium underline-offset-4 hover:underline"
            >
              View all
            </Link>
          ) : undefined
        }
      />
      {overview.activity.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 pb-8 text-center sm:px-6">
          <Illustration scene="activity" />
          <p className="text-muted-foreground text-sm">Changes your team makes will appear here.</p>
        </div>
      ) : (
        <ol className="relative flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {overview.activity.length > 1 && (
            <span
              aria-hidden
              className="bg-border absolute top-3 bottom-8 left-[2.25rem] w-px sm:left-[2.5rem]"
            />
          )}
          {overview.activity.map((item) => (
            <li key={item.id} className="relative flex gap-3 text-sm">
              <span
                aria-hidden
                className="bg-muted text-muted-foreground ring-card grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-4"
              >
                {initials(item.actorName ?? "?") || "?"}
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="min-w-0 break-words">
                  <span className="font-medium">{item.actorName ?? "Someone"}</span>{" "}
                  {activityVerb(item.action)}{" "}
                  {item.targetTitle &&
                    (item.entryId ? (
                      <Link
                        href={entryHref(item.entryId)}
                        className="text-primary-strong underline-offset-4 hover:underline"
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
              </div>
            </li>
          ))}
        </ol>
      )}
    </VisualCard>
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

function SetupCard({ siteId, steps }: { siteId: string; steps: SetupStep[] }) {
  const done = steps.filter((step) => step.done).length;
  return (
    <VisualCard aria-labelledby="setup-heading">
      <CardHeader
        id="setup-heading"
        title="Get set up"
        description={`${done} of ${steps.length} done`}
        icon={Rocket}
      />
      <div className="px-5 sm:px-6">
        <ProgressBar value={done} max={steps.length} steps={steps.length} label="Setup progress" />
      </div>
      <ul className="flex flex-col px-2 pt-3 pb-3 sm:px-3">
        {steps.map((step) => {
          const { label, section } = SETUP_TEXT[step.key];
          const href =
            section === "settings"
              ? siteHref(siteId, "settings", "integrations")
              : siteHref(siteId, section);
          return (
            <li key={step.key}>
              {step.done ? (
                <p className="text-muted-foreground flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm line-through">
                  <CircleCheck className="text-success size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="sr-only">Done: </span>
                    {label}
                  </span>
                </p>
              ) : (
                <Link
                  href={href}
                  className={cn(
                    "hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm outline-none focus-visible:ring-[3px]",
                  )}
                >
                  <Circle className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </VisualCard>
  );
}
