"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { ApiKeyLimitError, createApiKey, revokeApiKey } from "@/server/api-keys";
import { NotAllowedError } from "@/server/errors";
import { apiKeyNameSchema } from "@/lib/api-keys";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";

/*
 * API key Server Actions. Arguments come from the browser, so ids are
 * validated and each action authorizes before touching data.
 */

const id = z.string().min(1).max(64);

export interface CreateApiKeyState {
  values: { name: string };
  errors?: { name?: string; form?: string };
  /** The new key, returned once so it can be shown and copied. */
  created?: { name: string; token: string };
}

const NO_PERMISSION = "You don't have permission to manage API keys on this site.";

export async function createApiKeyAction(
  _previous: CreateApiKeyState,
  formData: FormData,
): Promise<CreateApiKeyState> {
  const values = { name: String(formData.get("name") ?? "") };
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };

  const name = apiKeyNameSchema.safeParse(values.name);
  if (!name.success) return { values, errors: { name: name.error.issues[0].message } };

  try {
    const { user } = await requireSitePermission(siteId.data, "api_keys.manage");
    const { token } = await createApiKey(await getDb(), user.id, siteId.data, name.data);
    refresh();
    return { values: { name: "" }, created: { name: name.data, token } };
  } catch (error) {
    if (error instanceof ApiKeyLimitError) return { values, errors: { form: error.message } };
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: NO_PERMISSION } };
    }
    throw error;
  }
}

export async function revokeApiKeyAction(
  siteId: string,
  keyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id.safeParse(siteId).success || !id.safeParse(keyId).success) {
    return { ok: false, error: "That key couldn't be found." };
  }
  try {
    const { user } = await requireSitePermission(siteId, "api_keys.manage");
    await revokeApiKey(await getDb(), user.id, siteId, keyId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: NO_PERMISSION };
    if (error instanceof NotAllowedError) {
      return { ok: false, error: "That key was already revoked or doesn't exist." };
    }
    throw error;
  }
  refresh();
  return { ok: true };
}
