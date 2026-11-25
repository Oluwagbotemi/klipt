import "server-only";

import { getDb } from "@/server/db";
import { getLastSchedulerRun, getSiteSchedule } from "@/server/scheduler";
import { isSchedulerConnected, type SchedulerRun } from "@/lib/scheduler";
import { requireSitePermission, getSite } from "@/lib/data/sites";

/* Scheduled publishing status for Settings › Publishing and the editor. */

export interface SchedulerStatus {
  lastRun: SchedulerRun | null;
  connected: boolean;
  scheduledCount: number;
  nextScheduledAt: string | null;
  /** When this status was read (ms), for "x minutes ago". */
  checkedAt: number;
}

/** Full status, for members who manage the site (owners and admins). */
export async function getSchedulerStatus(siteId: string): Promise<SchedulerStatus> {
  await requireSitePermission(siteId, "site.update");
  const db = await getDb();
  const [lastRun, schedule] = await Promise.all([
    getLastSchedulerRun(db),
    getSiteSchedule(db, siteId),
  ]);
  const checkedAt = Date.now();
  return { lastRun, connected: isSchedulerConnected(lastRun, checkedAt), checkedAt, ...schedule };
}

/** Whether scheduled entries go live within a minute (any member, for the editor's hint). */
export async function getSchedulerConnected(siteId: string): Promise<boolean> {
  await getSite(siteId);
  return isSchedulerConnected(await getLastSchedulerRun(await getDb()));
}
