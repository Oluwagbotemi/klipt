import "server-only";

import { cache } from "react";
import { getDb } from "@/server/db";
import * as seoRepo from "@/server/seo";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";

/* Data access for the SEO section; not-found for non-members. */

export const getSeoReport = cache(async (siteId: string) => {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  const report = await seoRepo.getSeoReport(await getDb(), user.id, siteId);
  // The report publishes due scheduled entries first, which may queue webhooks.
  scheduleWebhookDelivery(siteId);
  return report;
});

export async function getRedirects(siteId: string, query: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return seoRepo.listSiteRedirects(await getDb(), user.id, siteId, query);
}
