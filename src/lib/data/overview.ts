import "server-only";

import { getDb } from "@/server/db";
import { getSiteOverview } from "@/server/overview";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";

/** The site's Overview; not-found for non-members. */
export async function getOverview(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  const overview = await getSiteOverview(await getDb(), user.id, siteId);
  // Opening the Overview may have published due scheduled entries.
  scheduleWebhookDelivery(siteId);
  return overview;
}
