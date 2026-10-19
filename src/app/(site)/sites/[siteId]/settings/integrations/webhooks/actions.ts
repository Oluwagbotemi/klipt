"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import { SecretUnavailableError } from "@/server/secrets";
import {
  createWebhook,
  deleteWebhook,
  processWebhookQueue,
  queueTestEvent,
  resendDelivery,
  revealWebhookSecret,
  rotateWebhookSecret,
  setWebhookEnabled,
  updateWebhook,
  WebhookLimitError,
  WebhookUrlError,
} from "@/server/webhooks";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { webhookHref, webhookInputSchema } from "@/lib/webhooks";

/*
 * Webhook Server Actions. Arguments come from the browser, so ids are
 * validated and each action authorizes (webhooks.manage) before touching data.
 */

const id = z.string().min(1).max(64);
const NO_PERMISSION = "You don't have permission to manage webhooks on this site.";

export interface WebhookFormState {
  values: { url: string; description: string; events: string[] };
  errors?: { url?: string; description?: string; events?: string; form?: string };
  saved?: boolean;
}

/** Create (no webhookId) or update a webhook from the add/edit form. */
export async function saveWebhookAction(
  _previous: WebhookFormState,
  formData: FormData,
): Promise<WebhookFormState> {
  const values = {
    url: String(formData.get("url") ?? ""),
    description: String(formData.get("description") ?? ""),
    events: formData.getAll("events").map(String),
  };
  const siteId = id.safeParse(formData.get("siteId"));
  const webhookId = formData.get("webhookId") ? id.safeParse(formData.get("webhookId")) : null;
  if (!siteId.success || (webhookId && !webhookId.success)) {
    return { values, errors: { form: "That webhook couldn't be found." } };
  }
  const parsed = webhookInputSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      values,
      errors: {
        url: fields.url?.[0],
        description: fields.description?.[0],
        events: fields.events?.[0],
      },
    };
  }

  let createdId: string | null = null;
  try {
    const { user } = await requireSitePermission(siteId.data, "webhooks.manage");
    const db = await getDb();
    if (webhookId?.success) {
      await updateWebhook(db, user.id, siteId.data, webhookId.data, parsed.data);
    } else {
      createdId = (await createWebhook(db, user.id, siteId.data, parsed.data)).id;
    }
  } catch (error) {
    if (error instanceof WebhookUrlError) return { values, errors: { url: error.message } };
    if (error instanceof WebhookLimitError) return { values, errors: { form: error.message } };
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: NO_PERMISSION } };
    }
    throw error;
  }
  if (createdId) redirect(`${webhookHref(siteId.data, createdId)}?created=1`);
  refresh();
  return { values, saved: true };
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function manage<T extends object>(
  siteId: string,
  webhookId: string,
  run: (userId: string) => Promise<T>,
): Promise<Result<T>> {
  if (!id.safeParse(siteId).success || !id.safeParse(webhookId).success) {
    return { ok: false, error: "That webhook couldn't be found." };
  }
  try {
    const { user } = await requireSitePermission(siteId, "webhooks.manage");
    return { ok: true, ...(await run(user.id)) };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: NO_PERMISSION };
    if (error instanceof SecretUnavailableError) return { ok: false, error: error.message };
    if (error instanceof NotAllowedError) {
      return { ok: false, error: "That webhook or delivery no longer exists." };
    }
    throw error;
  }
}

export async function setWebhookEnabledAction(siteId: string, webhookId: string, enabled: boolean) {
  const result = await manage(siteId, webhookId, async (userId) => {
    await setWebhookEnabled(await getDb(), userId, siteId, webhookId, z.boolean().parse(enabled));
    return {};
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteWebhookAction(siteId: string, webhookId: string) {
  const result = await manage(siteId, webhookId, async (userId) => {
    await deleteWebhook(await getDb(), userId, siteId, webhookId);
    return {};
  });
  if (result.ok) redirect(webhookHref(siteId));
  return result;
}

export async function revealSecretAction(siteId: string, webhookId: string) {
  return manage(siteId, webhookId, async (userId) => ({
    secret: await revealWebhookSecret(await getDb(), userId, siteId, webhookId),
  }));
}

export async function rotateSecretAction(siteId: string, webhookId: string) {
  return manage(siteId, webhookId, async (userId) => {
    const db = await getDb();
    await rotateWebhookSecret(db, userId, siteId, webhookId);
    return { secret: await revealWebhookSecret(db, userId, siteId, webhookId) };
  });
}

/** Sends a delivery right away and reports whether the website accepted it. */
async function sendNow(deliveryId: string) {
  const { sent } = await processWebhookQueue(await getDb(), { deliveryIds: [deliveryId] });
  refresh();
  return { delivered: sent === 1 };
}

export async function sendTestAction(siteId: string, webhookId: string) {
  return manage(siteId, webhookId, async (userId) =>
    sendNow(await queueTestEvent(await getDb(), userId, siteId, webhookId)),
  );
}

export async function resendDeliveryAction(siteId: string, webhookId: string, deliveryId: string) {
  if (!id.safeParse(deliveryId).success) return { ok: false as const, error: "Not found." };
  return manage(siteId, webhookId, async (userId) =>
    sendNow(await resendDelivery(await getDb(), userId, siteId, deliveryId)),
  );
}
