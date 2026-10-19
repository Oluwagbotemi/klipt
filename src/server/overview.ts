import { and, asc, count, desc, eq, gte, inArray, isNull, like, or, sql } from "drizzle-orm";
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
import { EMPTY_DOC, sanitizeDoc, wordCount } from "@/lib/editor/rich-text";
import {
  ACTIVITY_ACTIONS,
  type ActivityItem,
  type OverviewEntry,
  type SeoIssue,
  type SeoIssueKey,
  type SiteOverview,
} from "@/lib/overview";
import { can } from "@/lib/permissions";
import { entryPath, entrySeoSchema, resolveSeo, SEO_GUIDANCE } from "@/lib/seo";

/*
 * Everything on a site's Overview, in one call. Counts and issues come from
 * the site's own records; nothing is estimated or invented.
 */

/** Published entries examined for SEO issues (newest first). */
const SEO_SCAN_LIMIT = 2000;

const entryColumns = {
  id: contentEntries.id,
  title: contentEntries.title,
  status: contentEntries.status,
  slug: contentEntries.slug,
  modelKey: contentModels.key,
  authorName: users.name,
  updatedAt: contentEntries.updatedAt,
  scheduledAt: contentEntries.scheduledAt,
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
};

const toEntry = (row: EntryRow): OverviewEntry => ({
  id: row.id,
  title: row.title,
  status: row.status,
  modelKey: row.modelKey,
  path: entryPath(row.modelKey, row.slug),
  authorName: row.authorName,
  updatedAt: row.updatedAt.toISOString(),
  scheduledAt: row.scheduledAt?.toISOString() ?? null,
});

export async function getSiteOverview(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<SiteOverview> {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  await publishDueEntries(db, siteId);

  const inSite = eq(contentEntries.siteId, siteId);
  const entries = () =>
    db
      .select(entryColumns)
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .leftJoin(users, eq(users.id, contentEntries.authorId));
  const manager = can(role, "webhooks.manage") || can(role, "api_keys.manage");

  const [statusRows, inReview, upcoming, recent, published, [media], activityRows] =
    await Promise.all([
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
      db
        .select({
          id: contentEntries.id,
          title: contentEntries.title,
          seo: contentEntries.seo,
          data: contentEntries.data,
        })
        .from(contentEntries)
        .where(and(inSite, eq(contentEntries.status, "published")))
        .orderBy(desc(contentEntries.publishedAt))
        .limit(SEO_SCAN_LIMIT),
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
          actorName: users.name,
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

  return {
    counts,
    media,
    inReview: inReview.map(toEntry),
    upcoming: upcoming.map(toEntry),
    recent: recent.map(toEntry),
    seoIssues: seoIssues(published),
    publishedCount: counts.published,
    activity: activityRows.map(toActivity),
    setup: manager ? await setupSteps(db, siteId, counts.published, media.total) : null,
    webhookFailures: manager ? await recentWebhookFailures(db, siteId) : null,
  };
}

function seoIssues(
  rows: { id: string; title: string; seo: unknown; data: Record<string, unknown> }[],
): SeoIssue[] {
  const found: Record<SeoIssueKey, { id: string; title: string }[]> = {
    missing_description: [],
    long_title: [],
    thin_content: [],
    noindex: [],
  };
  for (const row of rows) {
    const seo = resolveSeo(entrySeoSchema.catch({}).parse(row.seo), row.title || "Untitled");
    const item = { id: row.id, title: row.title || "Untitled" };
    if (!seo.description) found.missing_description.push(item);
    if (seo.title.length > SEO_GUIDANCE.title.max) found.long_title.push(item);
    if (!seo.index) found.noindex.push(item);
    let body = EMPTY_DOC;
    try {
      body = row.data.body ? sanitizeDoc(row.data.body) : EMPTY_DOC;
    } catch {
      // Unreadable bodies count as empty.
    }
    if (wordCount(body) < 50) found.thin_content.push(item);
  }
  return (Object.entries(found) as [SeoIssueKey, { id: string; title: string }[]][])
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({ key, count: items.length, examples: items.slice(0, 3) }));
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
