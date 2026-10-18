import "server-only";

import { notFound } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/server/db";
import * as webhooksRepo from "@/server/webhooks";
import { requireUser } from "@/lib/data/session";

/*
 * Data access for webhooks, plus scheduling of sends. Sends run in after()
 * so they never slow down the request that caused them.
 */

export async function getWebhooks(siteId: string) {
  const user = await requireUser();
  return webhooksRepo.listWebhooks(await getDb(), user.id, siteId);
}

/** One webhook with its recent deliveries; not-found if it isn't on this site. */
export async function getWebhookDetail(siteId: string, webhookId: string) {
  const user = await requireUser();
  const db = await getDb();
  const webhook = await webhooksRepo.getWebhook(db, user.id, siteId, webhookId);
  if (!webhook) notFound();
  const deliveries = await webhooksRepo.listDeliveries(db, user.id, siteId, webhookId);
  return { webhook, deliveries };
}

/** Longest a request keeps running afterwards to send combined updates. */
const SETTLE_MS = 35_000;

/**
 * Sends due webhook deliveries after the response. Call from request-time
 * code only (Server Actions, route handlers, dynamic pages). `settle` keeps
 * going briefly so throttled "entry.updated" events still go out.
 */
export function scheduleWebhookDelivery(siteId: string, options: { settle?: boolean } = {}) {
  after(async () => {
    try {
      await webhooksRepo.deliverWebhooks(await getDb(), {
        siteId,
        settleMs: options.settle ? SETTLE_MS : 0,
      });
    } catch (error) {
      console.error("Webhook delivery failed", error);
    }
  });
}
