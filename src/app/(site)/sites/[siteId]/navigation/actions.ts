"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import {
  createMenu,
  deleteMenu,
  MenuConflictError,
  MenuKeyTakenError,
  MenuLimitError,
  MenuValidationError,
  saveMenu,
  searchMenuTargets,
} from "@/server/menus";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { createMenuSchema, type MenuDetail } from "@/lib/menus";
import type { LinkTarget } from "@/lib/models";
import { siteHref } from "@/lib/navigation";

/*
 * Navigation Server Actions. Changes need navigation.manage (owners, admins
 * and editors); the server functions check it again inside their transaction.
 */

const id = z.string().min(1).max(64);
const menuKey = z.string().min(1).max(40);
const NO_PERMISSION = "Only owners, admins and editors can change navigation.";

function isPermissionError(error: unknown) {
  return error instanceof ForbiddenError || error instanceof NotAllowedError;
}

export interface NewMenuState {
  values: { name: string; key: string };
  errors?: { name?: string; key?: string; form?: string };
}

export async function createMenuAction(
  _previous: NewMenuState,
  formData: FormData,
): Promise<NewMenuState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    key: String(formData.get("key") ?? "").trim(),
  };
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  const parsed = createMenuSchema.safeParse(values);
  if (!parsed.success) {
    const errors: NonNullable<NewMenuState["errors"]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "key" ? "key" : "name";
      errors[field] ??= issue.message;
    }
    return { values, errors };
  }
  try {
    const { user } = await requireSitePermission(siteId.data, "navigation.manage");
    await createMenu(await getDb(), user.id, siteId.data, parsed.data);
  } catch (error) {
    if (error instanceof MenuKeyTakenError) return { values, errors: { key: error.message } };
    if (error instanceof MenuLimitError) return { values, errors: { form: error.message } };
    if (isPermissionError(error)) return { values, errors: { form: NO_PERMISSION } };
    throw error;
  }
  redirect(`${siteHref(siteId.data, "navigation")}/${parsed.data.key}`);
}

export async function deleteMenuAction(siteId: string, key: string): Promise<{ error: string }> {
  const parsed = z.object({ siteId: id, key: menuKey }).safeParse({ siteId, key });
  if (!parsed.success) return { error: "That menu couldn't be found." };
  try {
    const { user } = await requireSitePermission(parsed.data.siteId, "navigation.manage");
    await deleteMenu(await getDb(), user.id, parsed.data.siteId, parsed.data.key);
  } catch (error) {
    if (isPermissionError(error)) return { error: NO_PERMISSION };
    throw error;
  }
  redirect(siteHref(parsed.data.siteId, "navigation"));
}

export type SaveMenuResult =
  { ok: true; menu: MenuDetail } | { ok: false; error: string; conflict?: boolean; index?: number };

/** Saves all of a menu's items. `items` is plain JSON from the editor. */
export async function saveMenuAction(
  siteId: string,
  key: string,
  input: { items: unknown; expectedUpdatedAt: string },
): Promise<SaveMenuResult> {
  const parsed = z
    .object({ siteId: id, key: menuKey, expectedUpdatedAt: z.string().min(1).max(40) })
    .safeParse({ siteId, key, expectedUpdatedAt: input.expectedUpdatedAt });
  if (!parsed.success) return { ok: false, error: "That menu couldn't be found." };
  try {
    const { user } = await requireSitePermission(parsed.data.siteId, "navigation.manage");
    const menu = await saveMenu(await getDb(), user.id, parsed.data.siteId, parsed.data.key, {
      items: input.items,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });
    scheduleWebhookDelivery(parsed.data.siteId);
    refresh();
    return { ok: true, menu };
  } catch (error) {
    if (error instanceof MenuConflictError) {
      return { ok: false, conflict: true, error: error.message };
    }
    if (error instanceof MenuValidationError) {
      return { ok: false, error: error.message, index: error.index };
    }
    if (isPermissionError(error)) return { ok: false, error: NO_PERMISSION };
    throw error;
  }
}

/** Entries a menu item can link to (the editor's picker). */
export async function searchMenuTargetsAction(siteId: string, q: string): Promise<LinkTarget[]> {
  const parsed = z.object({ siteId: id, q: z.string().max(100) }).safeParse({ siteId, q });
  if (!parsed.success) return [];
  const { user } = await requireSitePermission(parsed.data.siteId, "navigation.manage");
  return searchMenuTargets(await getDb(), user.id, parsed.data.siteId, parsed.data.q);
}
