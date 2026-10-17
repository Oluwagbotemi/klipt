"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, type Database } from "@/server/db";
import {
  ConflictError,
  EditorValidationError,
  changeSlug,
  saveEntry,
  transitionEntry,
  type EntryState,
} from "@/server/editor";
import type { WorkflowAction } from "@/lib/content";
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

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export type EditorResult =
  | { ok: true; state: EntryState; redirectCreated?: boolean }
  | { ok: false; error: string; field?: string; conflict?: boolean };

async function editorCall(
  siteId: string,
  entryId: string,
  run: (userId: string, db: Database) => Promise<EntryState & { redirectCreated?: boolean }>,
): Promise<EditorResult> {
  if (!id.safeParse(siteId).success || !id.safeParse(entryId).success) {
    return { ok: false, error: "That entry couldn't be found." };
  }
  const { user } = await requireSitePermission(siteId, "site.view");
  try {
    const { redirectCreated, ...state } = await run(user.id, await getDb());
    return { ok: true, state, redirectCreated };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, conflict: true, error: error.message };
    }
    if (error instanceof EditorValidationError) {
      return { ok: false, error: error.message, field: error.field };
    }
    if (error instanceof NotAllowedError) {
      return { ok: false, error: "You don't have permission to make that change." };
    }
    throw error;
  }
}

const version = z.string().min(1).max(40);

/** Autosave: title, body and SEO. */
export async function saveEntryAction(
  siteId: string,
  entryId: string,
  input: { title: string; body: unknown; seo: unknown; expectedUpdatedAt: string },
): Promise<EditorResult> {
  if (!version.safeParse(input?.expectedUpdatedAt).success || typeof input.title !== "string") {
    return { ok: false, error: "Nothing to save." };
  }
  return editorCall(siteId, entryId, (userId, db) => saveEntry(db, userId, siteId, entryId, input));
}

export async function changeSlugAction(
  siteId: string,
  entryId: string,
  input: { slug: string; createRedirect: boolean; expectedUpdatedAt: string },
): Promise<EditorResult> {
  const parsed = z
    .object({ slug: z.string().max(200), createRedirect: z.boolean(), expectedUpdatedAt: version })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a URL slug.", field: "slug" };
  const result = await editorCall(siteId, entryId, (userId, db) =>
    changeSlug(db, userId, siteId, entryId, parsed.data),
  );
  if (result.ok) refresh();
  return result;
}

export async function entryWorkflowAction(
  siteId: string,
  entryId: string,
  input: { action: WorkflowAction; scheduledAt?: string | null; expectedUpdatedAt: string },
): Promise<EditorResult> {
  const parsed = z
    .object({
      action: z.enum(["publish", "schedule", "unpublish", "submit", "withdraw"]),
      scheduledAt: z.string().max(40).nullish(),
      expectedUpdatedAt: version,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That change isn't available." };
  const result = await editorCall(siteId, entryId, (userId, db) =>
    transitionEntry(db, userId, siteId, entryId, parsed.data),
  );
  if (result.ok) refresh();
  return result;
}
