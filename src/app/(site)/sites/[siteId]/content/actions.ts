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
import { searchLinkTargets } from "@/server/models";
import { AssignmentError, setAssignment } from "@/server/assignments";
import type { AssignmentState } from "@/lib/assignments";
import type { EntryEvent } from "@/server/notifications";
import type { LinkTarget } from "@/lib/models";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { siteHref } from "@/lib/navigation";
import { notifyAboutEntry } from "@/lib/data/email";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";

/*
 * Content Server Actions. Arguments come from the browser, so each one is
 * validated, and each action authorizes before touching data.
 */

const id = z.string().min(1).max(64);

/** Creates a draft of a built-in ("page", "post") or custom content type and opens it. */
export async function createEntryAction(
  siteId: string,
  modelKey: string,
): Promise<{ error: string }> {
  const modelKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);
  const input = z.object({ siteId: id, modelKey: modelKeySchema }).safeParse({
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
  scheduleWebhookDelivery(input.data.siteId);

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
  | { ok: false; error: string; field?: string; fieldKey?: string; conflict?: boolean };

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
    scheduleWebhookDelivery(siteId, { settle: true });
    return { ok: true, state, redirectCreated };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, conflict: true, error: error.message };
    }
    if (error instanceof EditorValidationError) {
      return { ok: false, error: error.message, field: error.field, fieldKey: error.fieldKey };
    }
    if (error instanceof NotAllowedError) {
      return { ok: false, error: "You don't have permission to make that change." };
    }
    throw error;
  }
}

const version = z.string().min(1).max(40);

/** Autosave: title, body, SEO and the content type's field values. */
export async function saveEntryAction(
  siteId: string,
  entryId: string,
  input: {
    title: string;
    body: unknown;
    seo: unknown;
    fields?: unknown;
    expectedUpdatedAt: string;
  },
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
  input: {
    action: WorkflowAction;
    scheduledAt?: string | null;
    note?: string | null;
    expectedUpdatedAt: string;
  },
): Promise<EditorResult> {
  const parsed = z
    .object({
      action: z.enum(["publish", "schedule", "unpublish", "submit", "withdraw", "request_changes"]),
      scheduledAt: z.string().max(40).nullish(),
      note: z.string().max(2000).nullish(),
      expectedUpdatedAt: version,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That change isn't available." };
  let email: { userId: string; event: EntryEvent } | null = null;
  const result = await editorCall(siteId, entryId, async (userId, db) => {
    const { previousStatus, ...state } = await transitionEntry(
      db,
      userId,
      siteId,
      entryId,
      parsed.data,
    );
    const event = workflowEmail(parsed.data.action, previousStatus, state, parsed.data.note);
    if (event) email = { userId, event };
    return state;
  });
  if (result.ok) {
    const sent = email as { userId: string; event: EntryEvent } | null;
    if (sent) await notifyAboutEntry(siteId, entryId, sent.userId, sent.event);
    refresh();
  }
  return result;
}

/** Which email (if any) a workflow change sends: review requests and their outcome. */
function workflowEmail(
  action: WorkflowAction,
  previousStatus: EntryState["status"],
  state: EntryState,
  note: string | null | undefined,
): EntryEvent | null {
  if (action === "submit") return { kind: "review_requested" };
  if (action === "request_changes") return { kind: "changes_requested", note: (note ?? "").trim() };
  if ((action === "publish" || action === "schedule") && previousStatus === "in_review") {
    return {
      kind: "approved",
      scheduledAt: action === "schedule" && state.scheduledAt ? new Date(state.scheduledAt) : null,
    };
  }
  return null;
}

/** Entries a "Link to content" field can point at (the editor's picker). */
export async function searchLinkTargetsAction(
  siteId: string,
  input: { modelKeys: string[]; q: string; excludeId?: string },
): Promise<LinkTarget[]> {
  const parsed = z
    .object({
      siteId: id,
      modelKeys: z.array(z.string().max(40)).max(20),
      q: z.string().max(100),
      excludeId: id.optional(),
    })
    .safeParse({ siteId, ...input });
  if (!parsed.success) return [];
  const { siteId: site, ...query } = parsed.data;
  const { user } = await requireSitePermission(site, "site.view");
  return searchLinkTargets(await getDb(), user.id, site, query);
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export type AssignmentResult =
  { ok: true; assignment: AssignmentState } | { ok: false; error: string };

/** Sets an entry's assignee and due date. Never changes the entry's version (no autosave conflicts). */
export async function setAssignmentAction(
  siteId: string,
  entryId: string,
  input: { assigneeId: string | null; dueOn: string | null },
): Promise<AssignmentResult> {
  const parsed = z
    .object({
      siteId: id,
      entryId: id,
      assigneeId: id.nullable(),
      dueOn: z.string().max(10).nullable(),
    })
    .safeParse({ siteId, entryId, ...input });
  if (!parsed.success) return { ok: false, error: "That assignment isn't valid." };
  const { user } = await requireSitePermission(parsed.data.siteId, "site.view");
  try {
    const { assigneeChanged, ...assignment } = await setAssignment(
      await getDb(),
      user.id,
      parsed.data.siteId,
      parsed.data.entryId,
      { assigneeId: parsed.data.assigneeId, dueOn: parsed.data.dueOn || null },
    );
    // Only a newly assigned person hears about it (never someone assigning themselves).
    if (assigneeChanged && assignment.assigneeId) {
      await notifyAboutEntry(parsed.data.siteId, parsed.data.entryId, user.id, {
        kind: "assigned",
        dueOn: assignment.dueOn,
      });
    }
    refresh();
    return { ok: true, assignment };
  } catch (error) {
    if (error instanceof AssignmentError) return { ok: false, error: error.message };
    if (error instanceof NotAllowedError) {
      return { ok: false, error: "You don't have permission to change this assignment." };
    }
    throw error;
  }
}
