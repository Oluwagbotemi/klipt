import "server-only";

import { getDb } from "@/server/db";
import * as activityRepo from "@/server/activity";
import type { ActivityParams } from "@/lib/activity";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";

/* Data access for Team › Activity. Pages check activity.view before calling. */

export async function getActivity(
  siteId: string,
  params: ActivityParams,
  options?: { pageSize?: number },
) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return activityRepo.listActivity(await getDb(), user.id, siteId, params, options);
}
