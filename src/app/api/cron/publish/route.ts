import { headers } from "next/headers";
import { isCronAuthorized } from "@/server/cron-auth";
import { getDb } from "@/server/db";
import { runScheduler } from "@/server/scheduler";

/*
 * Scheduled publishing, meant to be called every minute by an external
 * scheduler such as cron-job.org (docs/scheduled-publishing.md), since Vercel
 * Hobby crons run at most daily. Publishes every due scheduled entry, sends the
 * webhooks that queued, and records the run for Settings › Publishing.
 * Needs `Authorization: Bearer $CRON_SECRET`. Safe to call concurrently.
 */

export const maxDuration = 60;

export async function GET() {
  if (!isCronAuthorized((await headers()).get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runScheduler(await getDb());
  return Response.json(result);
}
