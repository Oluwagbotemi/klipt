/*
 * Scheduled publishing status, shared by server and client. An external
 * scheduler calls `/api/cron/publish` every minute (docs/scheduled-publishing.md);
 * without it, scheduled entries go live on the next read or the daily cron.
 */

export interface SchedulerRun {
  /** ISO time of the last run. */
  at: string;
  published: number;
  webhooksSent: number;
}

/** A run within this window means something is calling the scheduler every minute. */
export const SCHEDULER_CONNECTED_MS = 5 * 60 * 1000;

export const SCHEDULER_GUIDE_URL =
  "https://github.com/Oluwagbotemi/klipt/blob/main/docs/scheduled-publishing.md";

export function isSchedulerConnected(run: SchedulerRun | null, now = Date.now()) {
  if (!run) return false;
  return now - Date.parse(run.at) < SCHEDULER_CONNECTED_MS;
}
