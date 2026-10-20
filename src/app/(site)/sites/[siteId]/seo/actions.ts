"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import { deleteRedirects, RedirectError, saveRedirect, setSearchVisibility } from "@/server/seo";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";

/*
 * SEO Server Actions. Arguments come from the browser, so everything is
 * validated, and each action authorizes (seo.manage) before touching data.
 */

const id = z.string().min(1).max(64);
const NO_PERMISSION = "You don't have permission to change SEO settings on this site.";

export interface RedirectFormState {
  values: { from: string; to: string; statusCode: string };
  errors?: { from?: string; to?: string; form?: string };
  saved?: { from: string; to: string; repointed: number };
}

export async function saveRedirectAction(
  _previous: RedirectFormState,
  formData: FormData,
): Promise<RedirectFormState> {
  const values = {
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
    statusCode: String(formData.get("statusCode") ?? "301"),
  };
  const siteId = id.safeParse(formData.get("siteId"));
  const raw = formData.get("redirectId");
  const redirectId = raw ? id.safeParse(raw) : null;
  if (!siteId.success || (redirectId && !redirectId.success)) {
    return { values, errors: { form: "That redirect couldn't be found." } };
  }
  try {
    const { user } = await requireSitePermission(siteId.data, "seo.manage");
    const result = await saveRedirect(
      await getDb(),
      user.id,
      siteId.data,
      values,
      redirectId?.success ? redirectId.data : undefined,
    );
    refresh();
    return { values, saved: { from: result.from, to: result.to, repointed: result.repointed } };
  } catch (error) {
    if (error instanceof RedirectError) return { values, errors: { [error.field]: error.message } };
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: NO_PERMISSION } };
    }
    throw error;
  }
}

export async function deleteRedirectsAction(siteId: string, redirectIds: string[]) {
  const input = z.object({ siteId: id, ids: z.array(id).min(1).max(500) }).safeParse({
    siteId,
    ids: redirectIds,
  });
  if (!input.success) return { ok: false as const, error: "Nothing to delete." };
  try {
    const { user } = await requireSitePermission(siteId, "seo.manage");
    const deleted = await deleteRedirects(await getDb(), user.id, siteId, input.data.ids);
    refresh();
    return { ok: true as const, deleted };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false as const, error: NO_PERMISSION };
    }
    throw error;
  }
}

export async function setSearchVisibilityAction(siteId: string, allowIndexing: boolean) {
  if (!id.safeParse(siteId).success || typeof allowIndexing !== "boolean") {
    return { ok: false as const, error: "That change isn't available." };
  }
  try {
    const { user } = await requireSitePermission(siteId, "seo.manage");
    await setSearchVisibility(await getDb(), user.id, siteId, allowIndexing);
    refresh();
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false as const, error: NO_PERMISSION };
    }
    throw error;
  }
}
