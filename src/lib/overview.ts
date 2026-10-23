import type { ContentStatus } from "@/lib/content";
import type { PageIssueKey } from "@/lib/seo-audit";

/** Site Overview data (client-safe types). Everything here is counted from real records. */

export interface OverviewEntry {
  id: string;
  title: string;
  status: ContentStatus;
  modelKey: string;
  path: string;
  authorName: string | null;
  updatedAt: string;
  scheduledAt: string | null;
}

export interface SeoIssue {
  key: PageIssueKey;
  count: number;
  /** Up to three entries to fix first. */
  examples: { id: string; title: string }[];
}

export interface ActivityItem {
  id: string;
  actorName: string | null;
  action: string;
  targetTitle: string | null;
  /** Entry to link to, when the event is about one that still exists. */
  entryId: string | null;
  createdAt: string;
}

export interface SetupStep {
  key: "publish" | "media" | "api_key" | "webhook";
  done: boolean;
}

/** Overview period in days (?period=7d|28d|90d). */
export const OVERVIEW_PERIODS = [7, 28, 90] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];
export const DEFAULT_OVERVIEW_PERIOD: OverviewPeriod = 28;

export function parseOverviewPeriod(value: string | string[] | undefined): OverviewPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw?.replace(/d$/, ""));
  return (OVERVIEW_PERIODS as readonly number[]).includes(days)
    ? (days as OverviewPeriod)
    : DEFAULT_OVERVIEW_PERIOD;
}

/** One bar of the publishing chart: a day (7D/28D) or a 7-day window (90D). */
export interface PublishingBucket {
  key: string;
  /** First and last day it covers, "YYYY-MM-DD" in the site's time zone. */
  from: string;
  to: string;
  /** Entries first published in it (past and current buckets). */
  published: number;
  /** Entries scheduled to publish in it (future buckets). */
  scheduled: number;
  kind: "past" | "current" | "future";
}

export interface PublishingActivity {
  unit: "day" | "week";
  buckets: PublishingBucket[];
  /** First publications in this period and in the one before it. */
  thisPeriod: number;
  previousPeriod: number;
  /** First publications per day in this period (oldest first), for sparklines. */
  daily: { day: string; count: number }[];
}

export interface WorkItem {
  id: string;
  title: string;
  status: ContentStatus;
  dueOn: string | null;
  overdue: boolean;
}

export interface SiteOverview {
  period: OverviewPeriod;
  /** Site time zone; "today" and the chart's days follow it. */
  timezone: string;
  publishing: PublishingActivity;
  /** Live pages with and without SEO suggestions. */
  seoHealth: { live: number; healthy: number };
  /** Drafts and reviews assigned to the viewer (members who create content), else null. */
  myWork: { items: WorkItem[]; total: number; overdue: number } | null;
  counts: Record<"published" | "draft" | "in_review" | "scheduled", number>;
  media: { total: number; missingAlt: number };
  inReview: OverviewEntry[];
  upcoming: OverviewEntry[];
  recent: OverviewEntry[];
  seoIssues: SeoIssue[];
  publishedCount: number;
  /** False when the whole site is hidden from search engines. */
  allowIndexing: boolean;
  activity: ActivityItem[];
  /** Only for members who can manage integrations; null otherwise. */
  setup: SetupStep[] | null;
  /** Failed webhook deliveries in the last 7 days (managers only). */
  webhookFailures: number | null;
}

const ACTIVITY_TEXT: Record<string, string> = {
  "content.created": "created",
  "content.published": "published",
  "content.unpublished": "unpublished",
  "content.scheduled": "scheduled",
  "content.submitted_for_review": "requested a review of",
  "content.changes_requested": "requested changes to",
  "content.withdrawn_from_review": "withdrew from review",
  "content.archived": "archived",
  "content.restored": "restored",
  "content.deleted": "deleted",
  "content.slug_changed": "changed the URL of",
  "media.uploaded": "uploaded",
  "media.deleted": "deleted the file",
  "api_key.created": "created the API key",
  "api_key.revoked": "revoked the API key",
  "webhook.created": "added a webhook for",
  "webhook.deleted": "deleted the webhook for",
  "site.created": "created the site",
  "member.joined": "joined the site",
  "member.role_changed": "changed the role of",
  "member.removed": "removed",
  "member.left": "left the site",
};

export const ACTIVITY_ACTIONS = Object.keys(ACTIVITY_TEXT);

export function activityVerb(action: string) {
  return ACTIVITY_TEXT[action] ?? action;
}

/** "YYYY-MM-DD" plus n days (calendar arithmetic, no time zone shifts). */
export function addDays(day: string, n: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/**
 * Buckets for the publishing chart. 7D and 28D use days, 90D uses 7-day windows
 * ending today. The bucket holding today is "current"; a few future buckets show
 * what's scheduled. Inputs are days ("YYYY-MM-DD", site time zone) of first
 * publications in the last two periods and of scheduled publications ahead.
 */
export function buildPublishingActivity({
  period,
  today,
  publishedDays,
  scheduledDays,
}: {
  period: OverviewPeriod;
  today: string;
  publishedDays: string[];
  scheduledDays: string[];
}): PublishingActivity {
  const unit = period === 90 ? "week" : "day";
  const size = unit === "week" ? 7 : 1;
  const pastCount = Math.ceil(period / size);
  const futureCount = period === 7 ? 3 : period === 28 ? 7 : 2;
  const inRange = (days: string[], from: string, to: string) =>
    days.filter((day) => day >= from && day <= to).length;

  const buckets: PublishingBucket[] = [];
  // Bucket i ends i windows before today (negative i: windows ahead of today).
  for (let i = pastCount - 1; i >= -futureCount; i--) {
    const to = addDays(today, -i * size);
    const from = addDays(to, -(size - 1));
    const kind = i > 0 ? "past" : i === 0 ? "current" : "future";
    buckets.push({
      key: from,
      from,
      to,
      published: kind === "future" ? 0 : inRange(publishedDays, from, to),
      scheduled: kind === "future" ? inRange(scheduledDays, from, to) : 0,
      kind,
    });
  }

  const periodStart = addDays(today, -(period - 1));
  const previousStart = addDays(today, -(2 * period - 1));
  const daily: { day: string; count: number }[] = [];
  for (let day = periodStart; day <= today; day = addDays(day, 1)) {
    daily.push({ day, count: inRange(publishedDays, day, day) });
  }
  return {
    unit,
    buckets,
    thisPeriod: inRange(publishedDays, periodStart, today),
    previousPeriod: inRange(publishedDays, previousStart, addDays(periodStart, -1)),
    daily,
  };
}
