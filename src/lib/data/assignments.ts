import "server-only";

import { getDb } from "@/server/db";
import * as assignmentsRepo from "@/server/assignments";
import { requireUser } from "@/lib/data/session";
import { getSite } from "@/lib/data/sites";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";

/* Data access for Team › Assignments and the editor's "Assigned to" panel. */

export async function getAssignmentBoard(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  const board = await assignmentsRepo.getAssignmentBoard(await getDb(), user.id, siteId);
  // Reading publishes due scheduled entries, which may have queued webhooks.
  scheduleWebhookDelivery(siteId);
  return board;
}

export async function getAssignees(siteId: string) {
  const [user] = await Promise.all([requireUser(), getSite(siteId)]);
  return assignmentsRepo.listAssignees(await getDb(), user.id, siteId);
}
