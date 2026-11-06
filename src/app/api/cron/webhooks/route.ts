import { headers } from "next/headers";
import { pruneActivity } from "@/server/activity";
import { isCronAuthorized } from "@/server/cron-auth";
import { getDb } from "@/server/db";
import { publishAllDueEntries } from "@/server/editor";
import { pruneVitals } from "@/server/performance";
import { processWebhookQueue, pruneDeliveries } from "@/server/webhooks";

/*
 * Daily job (vercel.json): publishes due scheduled entries on every site (the
 * fallback when no minute scheduler calls /api/cron/publish), sends webhook
 * retries that are due, and prunes old delivery history and site activity
 * (kept for a year) and Core Web Vitals older than 90 days.
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
 */

export const maxDuration = 300;

export async function GET() {
  if (!isCronAuthorized((await headers()).get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const { sites: sitesPublished } = await publishAllDueEntries(db);
  let sent = 0;
  let failed = 0;
  // Batches until the queue is empty or ~4 minutes have passed.
  const stopAt = Date.now() + 240_000;
  while (Date.now() < stopAt) {
    const batch = await processWebhookQueue(db, { limit: 50 });
    sent += batch.sent;
    failed += batch.failed;
    if (batch.sent + batch.failed === 0) break;
  }
  await pruneDeliveries(db);
  const activityPruned = await pruneActivity(db);
  const vitalsPruned = await pruneVitals(db);
  return Response.json({ sitesPublished, sent, failed, activityPruned, vitalsPruned });
}
