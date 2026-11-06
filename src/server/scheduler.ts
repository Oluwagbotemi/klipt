import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { auditEvents, contentEntries } from "@/server/db/schema";
import { publishAllDueEntries } from "@/server/editor";
import { processWebhookQueue } from "@/server/webhooks";
import type { SchedulerRun } from "@/lib/scheduler";

/*
 * The minute scheduler behind `/api/cron/publish`: publishes due scheduled
 * entries on every site, then sends the webhooks that queued. Its last run is
 * kept as a single site-less row in audit_events (action "scheduler.ran"),
 * which never shows in a site's Activity, so Settings › Publishing can say
 * whether an external scheduler is calling it.
 */

const RUN_ACTION = "scheduler.ran";

export interface SchedulerResult {
  published: number;
  sites: number;
  webhooksSent: number;
  webhooksFailed: number;
}

export async function runScheduler(
  db: DbOrTx,
  options: { now?: Date; webhookBudgetMs?: number } = {},
): Promise<SchedulerResult> {
  const { sites, published } = await publishAllDueEntries(db, options.now);
  let webhooksSent = 0;
  let webhooksFailed = 0;
  const stopAt = Date.now() + (options.webhookBudgetMs ?? 45_000);
  while (Date.now() < stopAt) {
    const batch = await processWebhookQueue(db, { limit: 50 });
    webhooksSent += batch.sent;
    webhooksFailed += batch.failed;
    if (batch.sent + batch.failed === 0) break;
  }
  const result = { published, sites, webhooksSent, webhooksFailed };
  await recordSchedulerRun(db, result, options.now);
  return result;
}

/** Overwrites the single "last run" row (inserting it the first time). */
async function recordSchedulerRun(db: DbOrTx, result: SchedulerResult, now = new Date()) {
  const metadata = { ...result };
  const updated = await db
    .update(auditEvents)
    .set({ createdAt: now, metadata })
    .where(and(isNull(auditEvents.siteId), eq(auditEvents.action, RUN_ACTION)))
    .returning({ id: auditEvents.id });
  if (updated.length > 0) return;
  await db.insert(auditEvents).values({
    siteId: null,
    actorId: null,
    action: RUN_ACTION,
    metadata,
    createdAt: now,
  });
}

/** How many entries the site has scheduled, and the next one's time. */
export async function getSiteSchedule(db: DbOrTx, siteId: string) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      next: sql<Date | string | null>`min(${contentEntries.scheduledAt})`,
    })
    .from(contentEntries)
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.status, "scheduled")));
  const next = row?.next ? new Date(row.next).toISOString() : null;
  return { scheduledCount: row?.count ?? 0, nextScheduledAt: next };
}

/** When the scheduler last ran and what it did, or null if it never has. */
export async function getLastSchedulerRun(db: DbOrTx): Promise<SchedulerRun | null> {
  const [row] = await db
    .select({ createdAt: auditEvents.createdAt, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(and(isNull(auditEvents.siteId), eq(auditEvents.action, RUN_ACTION)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);
  if (!row) return null;
  const count = (key: string) => {
    const value = row.metadata[key];
    return typeof value === "number" ? value : 0;
  };
  return {
    at: row.createdAt.toISOString(),
    published: count("published"),
    webhooksSent: count("webhooksSent"),
  };
}
