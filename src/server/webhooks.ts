import { createHmac, randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, inArray, lt, lte, min, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { auditEvents, sites, webhookDeliveries, webhooks } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/secrets";
import { loadPathRules } from "@/server/path-rules";
import { getSiteRole } from "@/server/sites";
import { assertPublicHost, checkWebhookUrl, WebhookUrlError } from "@/server/webhook-url";
import { can } from "@/lib/permissions";
import { entryDate, entryPath } from "@/lib/url-patterns";
import {
  MAX_ATTEMPTS,
  MAX_WEBHOOKS,
  RETRY_DELAYS_MS,
  webhookInputSchema,
  type DeliveryStatus,
  type WebhookDeliverySummary,
  type WebhookEvent,
  type WebhookSummary,
} from "@/lib/webhooks";

export { WebhookUrlError };

/*
 * Webhooks: Klipt POSTs a signed JSON message to a customer's website when
 * content changes. Events are written to webhook_deliveries in the same
 * transaction as the change (an outbox), then sent by processWebhookQueue()
 * after the response, retried with backoff, and logged for the delivery list.
 *
 * Management functions take an explicit userId and need webhooks.manage.
 */

export class WebhookLimitError extends Error {
  constructor() {
    super(`A site can have up to ${MAX_WEBHOOKS} webhooks.`);
  }
}

const UPDATE_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
/** A claimed delivery is retried after this long if the sender crashed mid-send. */
const CLAIM_LEASE_MS = 2 * 60_000;
const RESPONSE_BODY_LIMIT = 2_000;
const RETENTION_DAYS = 30;

async function requireManager(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role || !can(role, "webhooks.manage")) {
    throw new NotAllowedError("Not allowed to manage webhooks.");
  }
}

const newSecret = () => `whsec_${randomBytes(32).toString("base64url")}`;

function parseInput(input: unknown) {
  const parsed = webhookInputSchema.parse(input);
  return { ...parsed, url: checkWebhookUrl(parsed.url), description: parsed.description || null };
}

async function audit(
  db: DbOrTx,
  siteId: string,
  userId: string,
  action: string,
  webhookId: string,
  metadata: Record<string, unknown> = {},
) {
  await db.insert(auditEvents).values({
    siteId,
    actorId: userId,
    action,
    targetType: "webhook",
    targetId: webhookId,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

function toSummary(
  row: typeof webhooks.$inferSelect,
  last?: { status: DeliveryStatus; attempts: number; event: string; createdAt: Date },
): WebhookSummary {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    events: row.events,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    lastDelivery: last
      ? {
          status: last.status,
          attempts: last.attempts,
          event: last.event,
          at: last.createdAt.toISOString(),
        }
      : null,
  };
}

export async function listWebhooks(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<WebhookSummary[]> {
  await requireManager(db, userId, siteId);
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.siteId, siteId))
    .orderBy(webhooks.createdAt);
  if (rows.length === 0) return [];
  const latest = await db
    .selectDistinctOn([webhookDeliveries.webhookId], {
      webhookId: webhookDeliveries.webhookId,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      event: webhookDeliveries.event,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(
      inArray(
        webhookDeliveries.webhookId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(webhookDeliveries.webhookId, desc(webhookDeliveries.createdAt));
  const byWebhook = new Map(latest.map((row) => [row.webhookId, row]));
  return rows.map((row) => toSummary(row, byWebhook.get(row.id)));
}

export async function getWebhook(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
): Promise<WebhookSummary | null> {
  return (await listWebhooks(db, userId, siteId)).find((hook) => hook.id === webhookId) ?? null;
}

export async function createWebhook(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: unknown,
): Promise<{ id: string }> {
  const values = parseInput(input);
  return db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    // Serialize creation per site so the limit can't be raced past.
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for("update");
    const [{ total }] = await tx
      .select({ total: count() })
      .from(webhooks)
      .where(eq(webhooks.siteId, siteId));
    if (total >= MAX_WEBHOOKS) throw new WebhookLimitError();
    const [hook] = await tx
      .insert(webhooks)
      .values({
        siteId,
        ...values,
        secretEncrypted: encryptSecret(newSecret()),
        createdById: userId,
      })
      .returning({ id: webhooks.id });
    await audit(tx, siteId, userId, "webhook.created", hook.id, { url: values.url });
    return hook;
  });
}

async function updateOwned(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
  changes: Partial<typeof webhooks.$inferInsert>,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  return db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    const [hook] = await tx
      .update(webhooks)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(webhooks.siteId, siteId), eq(webhooks.id, webhookId)))
      .returning({ id: webhooks.id, url: webhooks.url });
    if (!hook) throw new NotAllowedError("Webhook not found.");
    await audit(tx, siteId, userId, action, webhookId, { url: hook.url, ...metadata });
  });
}

export async function updateWebhook(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
  input: unknown,
) {
  const values = parseInput(input);
  await updateOwned(db, userId, siteId, webhookId, values, "webhook.updated", { url: values.url });
}

export async function setWebhookEnabled(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
  enabled: boolean,
) {
  await updateOwned(
    db,
    userId,
    siteId,
    webhookId,
    { enabled },
    enabled ? "webhook.enabled" : "webhook.disabled",
  );
}

export async function rotateWebhookSecret(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
) {
  await updateOwned(
    db,
    userId,
    siteId,
    webhookId,
    { secretEncrypted: encryptSecret(newSecret()) },
    "webhook.secret_rotated",
  );
}

/** The signing secret, for the customer to configure on their website. */
export async function revealWebhookSecret(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
): Promise<string> {
  await requireManager(db, userId, siteId);
  const [hook] = await db
    .select({ secretEncrypted: webhooks.secretEncrypted })
    .from(webhooks)
    .where(and(eq(webhooks.siteId, siteId), eq(webhooks.id, webhookId)))
    .limit(1);
  if (!hook) throw new NotAllowedError("Webhook not found.");
  return decryptSecret(hook.secretEncrypted);
}

export async function deleteWebhook(db: DbOrTx, userId: string, siteId: string, webhookId: string) {
  await db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    const [hook] = await tx
      .delete(webhooks)
      .where(and(eq(webhooks.siteId, siteId), eq(webhooks.id, webhookId)))
      .returning({ url: webhooks.url });
    if (!hook) throw new NotAllowedError("Webhook not found.");
    await audit(tx, siteId, userId, "webhook.deleted", webhookId, { url: hook.url });
  });
}

export async function listDeliveries(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
  limit = 25,
): Promise<WebhookDeliverySummary[]> {
  await requireManager(db, userId, siteId);
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.siteId, siteId), eq(webhookDeliveries.webhookId, webhookId)))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.status === "pending" ? row.nextAttemptAt.toISOString() : null,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody,
    error: row.error,
    durationMs: row.durationMs,
    payload: bodyOf(row),
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Queues a "ping" for one webhook. Returns the delivery id to send right away. */
export async function queueTestEvent(
  db: DbOrTx,
  userId: string,
  siteId: string,
  webhookId: string,
): Promise<string> {
  await requireManager(db, userId, siteId);
  const [hook] = await db
    .select({ id: webhooks.id, siteName: sites.name })
    .from(webhooks)
    .innerJoin(sites, eq(sites.id, webhooks.siteId))
    .where(and(eq(webhooks.siteId, siteId), eq(webhooks.id, webhookId)))
    .limit(1);
  if (!hook) throw new NotAllowedError("Webhook not found.");
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      siteId,
      webhookId,
      event: "ping",
      payload: {
        site: { id: siteId, name: hook.siteName },
        data: { message: "Test event from Klipt. Your webhook is connected." },
      },
    })
    .returning({ id: webhookDeliveries.id });
  return delivery.id;
}

/** Sends a past delivery again, as a new delivery with the same content. */
export async function resendDelivery(
  db: DbOrTx,
  userId: string,
  siteId: string,
  deliveryId: string,
): Promise<string> {
  await requireManager(db, userId, siteId);
  const [original] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.siteId, siteId), eq(webhookDeliveries.id, deliveryId)))
    .limit(1);
  if (!original) throw new NotAllowedError("Delivery not found.");
  const [copy] = await db
    .insert(webhookDeliveries)
    .values({
      siteId,
      webhookId: original.webhookId,
      event: original.event,
      entryId: original.entryId,
      payload: original.payload,
    })
    .returning({ id: webhookDeliveries.id });
  return copy.id;
}

// ---------------------------------------------------------------------------
// Events (called inside the transaction that makes the change)
// ---------------------------------------------------------------------------

export interface EntryEventSubject {
  id: string;
  modelKey: string;
  slug: string;
  title: string;
  /** For URL patterns with {yyyy}/{mm}. */
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
}

/**
 * Queues an entry event for every enabled webhook of the site that
 * subscribes to it. Rapid "entry.updated" events for the same entry are
 * combined and sent at most every 30 seconds.
 */
export async function enqueueEntryEvent(
  tx: DbOrTx,
  siteId: string,
  event: Exclude<WebhookEvent, "ping">,
  entry: EntryEventSubject,
  extra: Record<string, unknown> = {},
) {
  const hooks = await tx
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.siteId, siteId),
        eq(webhooks.enabled, true),
        sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`,
      ),
    );
  if (hooks.length === 0) return;

  const [site] = await tx
    .select({ name: sites.name, domain: sites.domain })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  const rules = await loadPathRules(tx, siteId);
  const path = entryPath(rules, entry.modelKey, entry.slug, entryDate(entry));
  const payload = {
    site: { id: siteId, name: site?.name ?? "" },
    data: {
      entry: {
        id: entry.id,
        type: entry.modelKey,
        title: entry.title,
        slug: entry.slug,
        path,
        url: site?.domain ? `https://${site.domain}${path}` : null,
      },
      ...extra,
    },
  };

  const now = new Date();
  for (const hook of hooks) {
    let nextAttemptAt = now;
    if (event === "entry.updated") {
      const same = and(
        eq(webhookDeliveries.webhookId, hook.id),
        eq(webhookDeliveries.entryId, entry.id),
        eq(webhookDeliveries.event, event),
      );
      const [waiting] = await tx
        .update(webhookDeliveries)
        .set({ payload })
        .where(
          and(same, eq(webhookDeliveries.status, "pending"), eq(webhookDeliveries.attempts, 0)),
        )
        .returning({ id: webhookDeliveries.id });
      if (waiting) continue;
      const [recent] = await tx
        .select({ createdAt: webhookDeliveries.createdAt })
        .from(webhookDeliveries)
        .where(
          and(same, gt(webhookDeliveries.createdAt, new Date(now.getTime() - UPDATE_INTERVAL_MS))),
        )
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(1);
      if (recent) nextAttemptAt = new Date(recent.createdAt.getTime() + UPDATE_INTERVAL_MS);
    }
    await tx.insert(webhookDeliveries).values({
      siteId,
      webhookId: hook.id,
      event,
      entryId: entry.id,
      payload,
      nextAttemptAt,
    });
  }
}

/** Queues a site-level event that isn't about one entry (e.g. "menu.updated"). */
export async function enqueueSiteEvent(
  tx: DbOrTx,
  siteId: string,
  event: Exclude<WebhookEvent, "ping" | `entry.${string}`>,
  data: Record<string, unknown>,
) {
  const hooks = await tx
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.siteId, siteId),
        eq(webhooks.enabled, true),
        sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`,
      ),
    );
  if (hooks.length === 0) return;
  const [site] = await tx
    .select({ name: sites.name })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  const payload = { site: { id: siteId, name: site?.name ?? "" }, data };
  await tx
    .insert(webhookDeliveries)
    .values(hooks.map((hook) => ({ siteId, webhookId: hook.id, event, payload })));
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

type DeliveryRow = typeof webhookDeliveries.$inferSelect;

/** The JSON body a website receives. */
function bodyOf(row: Pick<DeliveryRow, "id" | "event" | "createdAt" | "payload">) {
  return { id: row.id, event: row.event, createdAt: row.createdAt.toISOString(), ...row.payload };
}

/** Header value: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. */
export function signPayload(secret: string, timestamp: number, body: string) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < RESPONSE_BODY_LIMIT) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text.slice(0, RESPONSE_BODY_LIMIT);
}

interface AttemptResult {
  ok: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  durationMs: number;
}

async function attempt(
  row: DeliveryRow,
  hook: { url: string; secretEncrypted: string },
): Promise<AttemptResult> {
  const started = Date.now();
  const result = (partial: Partial<AttemptResult>): AttemptResult => ({
    ok: false,
    responseStatus: null,
    responseBody: null,
    error: null,
    durationMs: Date.now() - started,
    ...partial,
  });
  try {
    await assertPublicHost(hook.url);
    const body = JSON.stringify(bodyOf(row));
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetch(hook.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Klipt-Webhooks/1.0",
        "Klipt-Event": row.event,
        "Klipt-Delivery": row.id,
        "Klipt-Signature": signPayload(decryptSecret(hook.secretEncrypted), timestamp, body),
      },
      body,
    });
    const responseBody = await readLimited(response).catch(() => "");
    const ok = response.status >= 200 && response.status < 300;
    let error: string | null = null;
    if (response.status >= 300 && response.status < 400) {
      error = "The address redirected. Use the final address; Klipt doesn't follow redirects.";
    } else if (!ok) {
      error = `Your website responded with ${response.status}.`;
    }
    return result({ ok, responseStatus: response.status, responseBody, error });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return result({ error: `No response within ${REQUEST_TIMEOUT_MS / 1000} seconds.` });
    }
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    const message =
      error instanceof WebhookUrlError ||
      (error instanceof Error && error.name === "SecretUnavailableError")
        ? error.message
        : `Couldn't connect to your website${cause ? ` (${cause})` : ""}.`;
    return result({ error: message });
  }
}

/**
 * Sends due deliveries. Each is claimed with a short lease (so concurrent
 * runs never send the same one twice), sent, then marked succeeded, retried
 * later with backoff, or failed after the last attempt.
 */
export async function processWebhookQueue(
  db: DbOrTx,
  options: { siteId?: string; deliveryIds?: string[]; limit?: number; now?: Date } = {},
): Promise<{ sent: number; failed: number }> {
  const now = options.now ?? new Date();
  const due = db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextAttemptAt, now),
        options.siteId ? eq(webhookDeliveries.siteId, options.siteId) : undefined,
        options.deliveryIds ? inArray(webhookDeliveries.id, options.deliveryIds) : undefined,
      ),
    )
    .orderBy(webhookDeliveries.nextAttemptAt)
    .limit(options.limit ?? 25)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(webhookDeliveries)
    .set({
      attempts: sql`${webhookDeliveries.attempts} + 1`,
      lastAttemptAt: now,
      nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS),
    })
    .where(inArray(webhookDeliveries.id, due))
    .returning();
  if (claimed.length === 0) return { sent: 0, failed: 0 };

  const hooks = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      enabled: webhooks.enabled,
      secretEncrypted: webhooks.secretEncrypted,
    })
    .from(webhooks)
    .where(inArray(webhooks.id, [...new Set(claimed.map((row) => row.webhookId))]));
  const byId = new Map(hooks.map((hook) => [hook.id, hook]));

  let sent = 0;
  let failed = 0;
  await Promise.all(
    claimed.map(async (row) => {
      const hook = byId.get(row.webhookId);
      const outcome: AttemptResult = hook?.enabled
        ? await attempt(row, hook)
        : {
            ok: false,
            responseStatus: null,
            responseBody: null,
            error: "Webhook is turned off.",
            durationMs: 0,
          };
      const final = outcome.ok || !hook?.enabled || row.attempts >= MAX_ATTEMPTS;
      const status: DeliveryStatus = outcome.ok ? "succeeded" : final ? "failed" : "pending";
      if (outcome.ok) sent++;
      else failed++;
      await db
        .update(webhookDeliveries)
        .set({
          status,
          responseStatus: outcome.responseStatus,
          responseBody: outcome.responseBody,
          error: outcome.error,
          durationMs: outcome.durationMs,
          ...(status === "pending"
            ? { nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[row.attempts - 1]) }
            : {}),
        })
        .where(eq(webhookDeliveries.id, row.id));
    }),
  );
  return { sent, failed };
}

/**
 * Sends what's due for a site, then waits (up to `settleMs`) for combined
 * updates that become due shortly, so the last edit in a burst still goes out.
 */
export async function deliverWebhooks(
  db: DbOrTx,
  options: { siteId?: string; settleMs?: number } = {},
) {
  const deadline = Date.now() + (options.settleMs ?? 0);
  for (;;) {
    await processWebhookQueue(db, { siteId: options.siteId });
    if (Date.now() >= deadline) return;
    const [{ next }] = await db
      .select({ next: min(webhookDeliveries.nextAttemptAt) })
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.status, "pending"),
          eq(webhookDeliveries.attempts, 0),
          options.siteId ? eq(webhookDeliveries.siteId, options.siteId) : undefined,
        ),
      );
    if (!next || next.getTime() > deadline) return;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, next.getTime() - Date.now()) + 50),
    );
  }
}

/** Removes delivery history older than the retention period. */
export async function pruneDeliveries(db: DbOrTx, now = new Date()) {
  await db
    .delete(webhookDeliveries)
    .where(
      and(
        lt(webhookDeliveries.createdAt, new Date(now.getTime() - RETENTION_DAYS * 86_400_000)),
        sql`${webhookDeliveries.status} <> 'pending'`,
      ),
    );
}
