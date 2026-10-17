"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { applyBulkAction, createEntry, NotAllowedError } from "@/server/content";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";

/*
 * Content Server Actions. Arguments come from the browser, so each one is
 * validated, and each action authorizes before touching data.
 */

const id = z.string().min(1).max(64);

export async function createEntryAction(
  siteId: string,
  modelKey: "page" | "post",
): Promise<{ error: string }> {
  const input = z.object({ siteId: id, modelKey: z.enum(["page", "post"]) }).safeParse({
    siteId,
    modelKey,
  });
  if (!input.success) return { error: "That content type isn't available." };

  let entryId: string;
  try {
    const { user } = await requireSitePermission(input.data.siteId, "content.create");
    entryId = (await createEntry(await getDb(), user.id, input.data.siteId, input.data.modelKey))
      .id;
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { error: "Your role on this site can't create content." };
    }
    throw error;
  }
  redirect(`${siteHref(input.data.siteId, "content")}/${entryId}`);
}

export interface BulkResult {
  applied: number;
  skipped: number;
  error?: string;
}

export async function bulkContentAction(
  siteId: string,
  entryIds: string[],
  action: "archive" | "restore" | "delete",
  options: { redirectToList?: boolean } = {},
): Promise<BulkResult> {
  const input = z
    .object({
      siteId: id,
      entryIds: z.array(id).min(1).max(500),
      action: z.enum(["archive", "restore", "delete"]),
    })
    .safeParse({ siteId, entryIds, action });
  if (!input.success) return { applied: 0, skipped: 0, error: "Nothing to update." };

  const { user } = await requireSitePermission(input.data.siteId, "site.view");
  const result = await applyBulkAction(
    await getDb(),
    user.id,
    input.data.siteId,
    input.data.entryIds,
    input.data.action,
  );

  if (options.redirectToList && result.applied > 0 && input.data.action === "delete") {
    redirect(siteHref(input.data.siteId, "content"));
  }
  refresh();
  return result;
}
