import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import {
  apiKeys,
  auditEvents,
  contentEntries,
  contentModels,
  mediaAssets,
  users,
  webhookDeliveries,
  webhooks,
} from "@/server/db/schema";
import { publishDueEntries } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import { isOverdue, todayIn } from "@/lib/assignments";
import {
  ACTIVITY_ACTIONS,
  buildPublishingActivity,
  DEFAULT_OVERVIEW_PERIOD,
  type ActivityItem,
  type OverviewEntry,
  type OverviewPeriod,
  type SiteOverview,
} from "@/lib/overview";
import { can } from "@/lib/permissions";
import { PAGE_ISSUE_KEYS } from "@/lib/seo-audit";
import { entryDate, entryPath, type PathRules } from "@/lib/url-patterns";
import { loadPathRules } from "@/server/path-rules";
import { loadSiteAudit } from "@/server/seo";

/*
 * Everything on a site's Overview, in one call. Counts and issues come from
 * the site's own records; nothing is estimated or invented.
 */

const entryColumns = {
  id: contentEntries.id,
  title: contentEntries.title,
  status: contentEntries.status,
  slug: contentEntries.slug,
  modelKey: contentModels.key,
  authorName: users.name,
  updatedAt: contentEntries.updatedAt,
  scheduledAt: contentEntries.scheduledAt,
  publishedAt: contentEntries.publishedAt,
};

type EntryRow = {
  id: string;
  title: string;
  status: OverviewEntry["status"];
  slug: string;
  modelKey: string;
  authorName: string | null;
  updatedAt: Date;
  scheduledAt: Date | null;
  publishedAt: Date | null;
};

const toEntry =
  (rules: PathRules) =>
  (row: EntryRow): OverviewEntry => ({
    id: row.id,
    title: row.title,
    status: row.status,
    modelKey: row.modelKey,
    path: entryPath(rules, row.modelKey, row.slug, entryDate(row)),
    authorName: row.authorName,
    updatedAt: row.updatedAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
  });

const DAY = 86_400_000;
/** Days of scheduled posts shown after today, per period. */
const FUTURE_DAYS: Record<OverviewPeriod, number> = { 7: 3, 28: 7, 90: 14 };

export async function getSiteOverview(
  db: DbOrTx,
  userId: string,
  siteId: string,
  {
    period = DEFAULT_OVERVIEW_PERIOD,
    now = new Date(),
  }: { period?: OverviewPeriod; now?: Date } = {},
): Promise<SiteOverview> {
  const role = await getSiteRole(db, userId, siteId);
  const rules = await loadPathRules(db, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  await publishDueEntries(db, siteId);
  const timezone = rules.timeZone;
  const today = todayIn(timezone, now);

  const inSite = eq(contentEntries.siteId, siteId);
  const entries = () =>
    db
      .select(entryColumns)
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .leftJoin(users, eq(users.id, contentEntries.authorId));
  const manager = can(role, "webhooks.manage") || can(role, "api_keys.manage");

  const [statusRows, inReview, upcoming, recent, audit, [media], activityRows] = await Promise.all([
    db
      .select({ status: contentEntries.status, total: count() })
      .from(contentEntries)
      .where(inSite)
      .groupBy(contentEntries.status),
    entries()
      .where(and(inSite, eq(contentEntries.status, "in_review")))
      .orderBy(asc(contentEntries.updatedAt))
      .limit(5),
    entries()
      .where(and(inSite, eq(contentEntries.status, "scheduled")))
      .orderBy(asc(contentEntries.scheduledAt))
      .limit(5),
    entries()
      .where(and(inSite, sql`${contentEntries.status} <> 'archived'`))
      .orderBy(desc(contentEntries.updatedAt))
      .limit(6),
    loadSiteAudit(db, siteId),
    db
      .select({
        total: count(),
        missingAlt:
          sql<number>`count(*) filter (where ${like(mediaAssets.mimeType, "image/%")} and coalesce(${mediaAssets.altText}, '') = '')`.mapWith(
            Number,
          ),
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.siteId, siteId)),
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        // A deleted account's name is kept on its activity.
        actorName: sql<string | null>`coalesce(${users.name}, ${auditEvents.actorName})`,
        entryTitle: contentEntries.title,
        entryId: contentEntries.id,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorId))
      .leftJoin(
        contentEntries,
        and(
          eq(auditEvents.targetType, "content_entry"),
          eq(contentEntries.id, auditEvents.targetId),
        ),
      )
      .where(
        and(
          eq(auditEvents.siteId, siteId),
          // Integration changes (key names, webhook URLs) are only shown to those who manage them.
          inArray(
            auditEvents.action,
            manager
              ? ACTIVITY_ACTIONS
              : ACTIVITY_ACTIONS.filter((a) => !/^(api_key|webhook)\./.test(a)),
          ),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(8),
  ]);

  const counts = { published: 0, draft: 0, in_review: 0, scheduled: 0 };
  for (const row of statusRows) {
    if (row.status in counts) counts[row.status as keyof typeof counts] = row.total;
  }

  // First publications over two periods (for the change badge) and what's scheduled ahead.
  // A day of slack on each side keeps the site's time zone inside the window.
  const [publishedRows, scheduledRows, myWork] = await Promise.all([
    db
      .select({ at: contentEntries.publishedAt })
      .from(contentEntries)
      .where(
        and(
          inSite,
          gte(contentEntries.publishedAt, new Date(now.getTime() - (2 * period + 1) * DAY)),
          lte(contentEntries.publishedAt, now),
        ),
      ),
    db
      .select({ at: contentEntries.scheduledAt })
      .from(contentEntries)
      .where(
        and(
          inSite,
          eq(contentEntries.status, "scheduled"),
          lte(
            contentEntries.scheduledAt,
            new Date(now.getTime() + (FUTURE_DAYS[period] + 1) * DAY),
          ),
        ),
      ),
    can(role, "content.create") ? loadMyWork(db, userId, siteId, today) : null,
  ]);
  const dayOf = (at: Date | null) => (at ? [todayIn(timezone, at)] : []);

  return {
    period,
    timezone,
    publishing: buildPublishingActivity({
      period,
      today,
      publishedDays: publishedRows.flatMap((row) => dayOf(row.at)),
      scheduledDays: scheduledRows.flatMap((row) => dayOf(row.at)),
    }),
    seoHealth: {
      live: audit.pages.length,
      healthy: audit.pages.filter((page) => page.issues.length === 0).length,
    },
    myWork,
    counts,
    media,
    inReview: inReview.map(toEntry(rules)),
    upcoming: upcoming.map(toEntry(rules)),
    recent: recent.map(toEntry(rules)),
    seoIssues: PAGE_ISSUE_KEYS.filter((key) => audit.issueCounts[key] > 0).map((key) => ({
      key,
      count: audit.issueCounts[key],
      examples: audit.pages
        .filter((page) => page.issues.includes(key))
        .slice(0, 3)
        .map((page) => ({ id: page.id, title: page.title })),
    })),
    publishedCount: counts.published,
    allowIndexing: audit.allowIndexing,
    activity: activityRows.map(toActivity),
    setup: manager ? await setupSteps(db, siteId, counts.published, media.total) : null,
    webhookFailures: manager ? await recentWebhookFailures(db, siteId) : null,
  };
}

function toActivity(row: {
  id: string;
  action: string;
  targetType: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actorName: string | null;
  entryTitle: string | null;
  entryId: string | null;
}): ActivityItem {
  const meta = row.metadata ?? {};
  const named = (key: string) => (typeof meta[key] === "string" ? (meta[key] as string) : null);
  return {
    id: row.id,
    actorName: row.actorName,
    action: row.action,
    targetTitle:
      row.entryTitle ?? named("title") ?? named("filename") ?? named("name") ?? named("url"),
    entryId: row.entryId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Unfinished entries assigned to the viewer, by due date (overdue first). */
async function loadMyWork(db: DbOrTx, userId: string, siteId: string, today: string) {
  const mine = and(
    eq(contentEntries.siteId, siteId),
    eq(contentEntries.assigneeId, userId),
    notInArray(contentEntries.status, ["published", "archived"]),
  );
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: contentEntries.id,
        title: contentEntries.title,
        status: contentEntries.status,
        dueOn: contentEntries.dueOn,
      })
      .from(contentEntries)
      .where(mine)
      .orderBy(sql`${contentEntries.dueOn} asc nulls last`, desc(contentEntries.updatedAt))
      .limit(4),
    db
      .select({
        total: count(),
        overdue: sql<number>`count(*) filter (where ${contentEntries.dueOn} < ${today})`.mapWith(
          Number,
        ),
      })
      .from(contentEntries)
      .where(mine),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      overdue: isOverdue(row, today),
    })),
    total: totals.total,
    overdue: totals.overdue,
  };
}

async function setupSteps(db: DbOrTx, siteId: string, published: number, media: number) {
  const [[keys], [hooks]] = await Promise.all([
    db
      .select({ total: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.siteId, siteId), isNull(apiKeys.revokedAt))),
    db.select({ total: count() }).from(webhooks).where(eq(webhooks.siteId, siteId)),
  ]);
  return [
    { key: "publish" as const, done: published > 0 },
    { key: "media" as const, done: media > 0 },
    { key: "api_key" as const, done: keys.total > 0 },
    { key: "webhook" as const, done: hooks.total > 0 },
  ];
}

async function recentWebhookFailures(db: DbOrTx, siteId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.siteId, siteId),
        or(
          eq(webhookDeliveries.status, "failed"),
          and(eq(webhookDeliveries.status, "pending"), sql`${webhookDeliveries.attempts} > 0`),
        ),
        gte(webhookDeliveries.createdAt, new Date(Date.now() - 7 * 86_400_000)),
      ),
    );
  return row.total;
}
