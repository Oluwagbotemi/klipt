import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { getDb } from "@/server/db";
import * as perfRepo from "@/server/performance";
import type { PerformanceQuery } from "@/server/performance";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/* Data access for Optimize › Performance; not-found for non-members. */

export const getPerformanceSetup = cache(async (siteId: string) => {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return perfRepo.getPerformanceSetup(await getDb(), user.id, siteId);
});

export const getPerformanceReport = cache(
  async (siteId: string, device: PerformanceQuery["device"], days: PerformanceQuery["days"]) => {
    const [user] = await Promise.all([requireUser(), getSite(siteId)]);
    return perfRepo.getPerformanceReport(await getDb(), user.id, siteId, { device, days });
  },
);

export const getAssetReport = cache(async (siteId: string) => {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return perfRepo.getAssetReport(await getDb(), user.id, siteId);
});

/** Rule-based suggestions from the site's measurements and media library. */
export async function getRecommendations(
  siteId: string,
  device: PerformanceQuery["device"],
  days: PerformanceQuery["days"],
) {
  const [report, assets] = await Promise.all([
    getPerformanceReport(siteId, device, days),
    getAssetReport(siteId),
  ]);
  return { report, recommendations: perfRepo.buildRecommendations(report, assets) };
}

export async function getPerformanceSummary(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return perfRepo.getPerformanceSummary(await getDb(), user.id, siteId);
}

/** Where this Klipt instance is served from, for the ingest address shown in the code. */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}
