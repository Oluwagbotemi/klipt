import { and, eq, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordEntryEdit } from "@/server/activity";
import type { DbOrTx } from "@/server/db";
import {
  auditEvents,
  contentEntries,
  contentModels,
  contentRevisions,
  redirects,
  users,
} from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { assertFieldTargets, fieldRefsFor } from "@/server/models";
import { loadPathRules, loadWorkflowRules } from "@/server/path-rules";
import { getSiteRole } from "@/server/sites";
import { enqueueEntryEvent } from "@/server/webhooks";
import { canEditEntry, workflowActions, type WorkflowAction } from "@/lib/content";
import { EMPTY_DOC, sanitizeDoc, type RichTextDoc } from "@/lib/editor/rich-text";
import {
  FieldValueError,
  firstMissingRequired,
  readFieldValues,
  validateFieldValues,
  type FieldValue,
} from "@/lib/models";
import type { EntryDocument, EntryState } from "@/lib/editor/types";
import { entrySeoSchema, slugSchema } from "@/lib/seo";
import { entryDate, entryPath } from "@/lib/url-patterns";

export type { EntryDocument, EntryState };

/*
 * Editing and publishing a single entry. Every write runs in a transaction
 * that locks the entry, re-checks the member's rights, and rejects the change
 * if the entry was modified since the editor loaded it (optimistic locking).
 */

export class ConflictError extends Error {
  constructor() {
    super("This entry was changed somewhere else since you opened it.");
  }
}

export class EditorValidationError extends Error {
  constructor(
    message: string,
    readonly field: "title" | "slug" | "seo" | "body" | "scheduledAt" | "fields" | "review",
    /** For "fields": the key of the content type field that's wrong. */
    readonly fieldKey?: string,
  ) {
    super(message);
  }
}

const iso = (date: Date | null) => date?.toISOString() ?? null;
const assignee = alias(users, "assignee");

/**
 * Publishes scheduled entries whose time has come. Runs before reads until a
 * background job does this; it only affects the given site.
 */
export async function publishDueEntries(db: DbOrTx, siteId: string) {
  await db.transaction(async (tx) => {
    const promoted = await tx
      .update(contentEntries)
      .set({
        status: "published",
        publishedAt: sql`coalesce(${contentEntries.publishedAt}, ${contentEntries.scheduledAt})`,
        scheduledAt: null,
      })
      .where(
        and(
          eq(contentEntries.siteId, siteId),
          eq(contentEntries.status, "scheduled"),
          lte(contentEntries.scheduledAt, new Date()),
        ),
      )
      .returning({
        id: contentEntries.id,
        slug: contentEntries.slug,
        title: contentEntries.title,
        modelId: contentEntries.modelId,
        publishedAt: contentEntries.publishedAt,
      });
    if (promoted.length === 0) return;
    const models = await tx
      .select({ id: contentModels.id, key: contentModels.key })
      .from(contentModels)
      .where(eq(contentModels.siteId, siteId));
    const keyOf = new Map(models.map((model) => [model.id, model.key]));
    for (const entry of promoted) {
      await enqueueEntryEvent(tx, siteId, "entry.published", {
        ...entry,
        modelKey: keyOf.get(entry.modelId) ?? "page",
      });
    }
  });
}

/** publishDueEntries for every site with something due (for the scheduled job). */
export async function publishAllDueEntries(db: DbOrTx) {
  const due = await db
    .selectDistinct({ siteId: contentEntries.siteId })
    .from(contentEntries)
    .where(
      and(eq(contentEntries.status, "scheduled"), lte(contentEntries.scheduledAt, new Date())),
    );
  for (const { siteId } of due) await publishDueEntries(db, siteId);
  return due.length;
}

export async function getEntryDocument(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
): Promise<EntryDocument | null> {
  if (!(await getSiteRole(db, userId, siteId))) throw new NotAllowedError("Not a member.");
  await publishDueEntries(db, siteId);

  const [row] = await db
    .select({
      entry: contentEntries,
      modelKey: contentModels.key,
      modelName: contentModels.name,
      isSystemModel: contentModels.isSystem,
      schemaType: contentModels.schemaType,
      modelFields: contentModels.fields,
      authorName: users.name,
      assigneeName: assignee.name,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .leftJoin(users, eq(users.id, contentEntries.authorId))
    .leftJoin(assignee, eq(assignee.id, contentEntries.assigneeId))
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
    .limit(1);
  if (!row) return null;

  const { entry } = row;
  let body = EMPTY_DOC;
  try {
    body = entry.data.body ? sanitizeDoc(entry.data.body) : EMPTY_DOC;
  } catch {
    // Never block opening an entry because of malformed legacy content.
  }
  const values = readFieldValues(row.modelFields, entry.data);
  const pathRules = await loadPathRules(db, siteId);
  return {
    entry: {
      id: entry.id,
      title: entry.title,
      slug: entry.slug,
      status: entry.status,
      modelKey: row.modelKey,
      modelName: row.modelName,
      isSystemModel: row.isSystemModel,
      authorId: entry.authorId,
      authorName: row.authorName,
      assigneeId: entry.assigneeId,
      assigneeName: row.assigneeName,
      dueOn: entry.dueOn,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      publishedAt: iso(entry.publishedAt),
      scheduledAt: iso(entry.scheduledAt),
    },
    body,
    seo: entrySeoSchema.catch({}).parse(entry.seo),
    schemaType: row.schemaType,
    path: entryPath(pathRules, row.modelKey, entry.slug, entryDate(entry)),
    pathRules,
    workflowRules: await loadWorkflowRules(db, siteId),
    reviewRequestedById: entry.reviewRequestedById,
    fields: row.modelFields,
    values,
    refs: await fieldRefsFor(db, siteId, row.modelFields, values),
    reviewFeedback: entry.reviewFeedback ?? null,
  };
}

/** Locks the entry and checks membership, edit rights and the expected version. */
async function lockForEdit(
  tx: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
  expectedUpdatedAt: string,
) {
  const role = await getSiteRole(tx, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member.");
  const [row] = await tx
    .select({
      entry: contentEntries,
      modelKey: contentModels.key,
      modelName: contentModels.name,
      modelFields: contentModels.fields,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
    .for("update", { of: contentEntries })
    .limit(1);
  if (!row) throw new NotAllowedError("Entry not found.");
  if (row.entry.updatedAt.toISOString() !== expectedUpdatedAt) throw new ConflictError();
  return { role, ...row };
}

function stateOf(entry: typeof contentEntries.$inferSelect): EntryState {
  return {
    status: entry.status,
    updatedAt: entry.updatedAt.toISOString(),
    publishedAt: iso(entry.publishedAt),
    scheduledAt: iso(entry.scheduledAt),
    slug: entry.slug,
    reviewRequestedById: entry.reviewRequestedById,
  };
}

function fieldError(error: unknown): never {
  if (error instanceof FieldValueError) {
    throw new EditorValidationError(error.message, "fields", error.fieldKey);
  }
  throw error;
}

/**
 * Saves title, body, SEO and (when given) the content type's field values
 * (autosave). Drafts may leave required fields empty. Returns the new version.
 */
export async function saveEntry(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
  input: {
    title: string;
    body: unknown;
    seo: unknown;
    fields?: unknown;
    expectedUpdatedAt: string;
  },
): Promise<EntryState> {
  const title = String(input.title ?? "").trim();
  if (title.length > 200) {
    throw new EditorValidationError("Keep the title to 200 characters or fewer.", "title");
  }
  let body: RichTextDoc;
  try {
    body = sanitizeDoc(input.body);
  } catch (error) {
    throw new EditorValidationError((error as Error).message, "body");
  }
  const seo = entrySeoSchema.safeParse(input.seo ?? {});
  if (!seo.success) throw new EditorValidationError(seo.error.issues[0].message, "seo");

  return db.transaction(async (tx) => {
    const { role, entry, modelKey, modelFields } = await lockForEdit(
      tx,
      userId,
      siteId,
      entryId,
      input.expectedUpdatedAt,
    );
    if (!canEditEntry(role, userId, entry)) throw new NotAllowedError("Can't edit this entry.");
    const data: Record<string, unknown> = { ...entry.data, body };
    if (input.fields !== undefined) {
      let values: Record<string, FieldValue> = {};
      try {
        values = validateFieldValues(modelFields, input.fields);
        await assertFieldTargets(tx, siteId, entryId, modelFields, values);
      } catch (error) {
        fieldError(error);
      }
      // Current fields are replaced; values of removed fields are kept, unseen.
      for (const field of modelFields) delete data[field.key];
      Object.assign(data, values);
    }
    const [updated] = await tx
      .update(contentEntries)
      .set({ title, data, seo: seo.data, updatedAt: new Date() })
      .where(eq(contentEntries.id, entryId))
      .returning();
    if (updated.status === "published") {
      await enqueueEntryEvent(tx, siteId, "entry.updated", { ...updated, modelKey });
    }
    await recordEntryEdit(tx, siteId, userId, updated);
    return stateOf(updated);
  });
}

/**
 * Changes the URL slug. For content that has been published, optionally adds
 * a 301 redirect from the old path, re-points older redirects to the new path
 * (no chains) and removes any redirect away from the new path (no loops).
 */
export async function changeSlug(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
  input: { slug: string; createRedirect: boolean; expectedUpdatedAt: string },
): Promise<EntryState & { redirectCreated: boolean }> {
  const parsed = slugSchema.safeParse(input.slug);
  if (!parsed.success) throw new EditorValidationError(parsed.error.issues[0].message, "slug");
  const slug = parsed.data;

  return db.transaction(async (tx) => {
    const { role, entry, modelKey, modelName } = await lockForEdit(
      tx,
      userId,
      siteId,
      entryId,
      input.expectedUpdatedAt,
    );
    if (!canEditEntry(role, userId, entry)) throw new NotAllowedError("Can't edit this entry.");
    if (slug === entry.slug) return { ...stateOf(entry), redirectCreated: false };

    const [clash] = await tx
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.siteId, siteId),
          eq(contentEntries.modelId, entry.modelId),
          eq(contentEntries.slug, slug),
          ne(contentEntries.id, entryId),
        ),
      )
      .limit(1);
    const rules = await loadPathRules(tx, siteId);
    const date = entryDate(entry);
    if (clash) {
      throw new EditorValidationError(
        `Another ${modelName.toLowerCase()} already uses ${entryPath(rules, modelKey, slug, date)}.`,
        "slug",
      );
    }

    const [updated] = await tx
      .update(contentEntries)
      .set({ slug, updatedAt: new Date() })
      .where(eq(contentEntries.id, entryId))
      .returning();

    const from = entryPath(rules, modelKey, entry.slug, date);
    const to = entryPath(rules, modelKey, slug, date);
    const redirectCreated = Boolean(entry.publishedAt) && input.createRedirect;
    if (redirectCreated) {
      // The new URL must not redirect anywhere (e.g. when moving back to an old slug).
      await tx
        .delete(redirects)
        .where(and(eq(redirects.siteId, siteId), eq(redirects.fromPath, to)));
      // Older URLs that pointed at the old path now point straight at the new one.
      await tx
        .update(redirects)
        .set({ toPath: to })
        .where(and(eq(redirects.siteId, siteId), eq(redirects.toPath, from)));
      await tx
        .insert(redirects)
        .values({
          siteId,
          fromPath: from,
          toPath: to,
          statusCode: 301,
          entryId,
          createdById: userId,
        })
        .onConflictDoUpdate({
          target: [redirects.siteId, redirects.fromPath],
          set: { toPath: to, statusCode: 301, entryId, createdById: userId },
        });
    }

    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "content.slug_changed",
      targetType: "content_entry",
      targetId: entryId,
      metadata: { title: updated.title, from, to, redirect: redirectCreated },
    });
    if (updated.status === "published") {
      await enqueueEntryEvent(
        tx,
        siteId,
        "entry.slug_changed",
        { ...updated, modelKey },
        { previousPath: from, redirectCreated },
      );
    }
    return { ...stateOf(updated), redirectCreated };
  });
}

const AUDIT_ACTION: Record<WorkflowAction, string> = {
  publish: "content.published",
  schedule: "content.scheduled",
  unpublish: "content.unpublished",
  submit: "content.submitted_for_review",
  withdraw: "content.withdrawn_from_review",
  request_changes: "content.changes_requested",
};

export const MAX_REVIEW_NOTE = 1000;

/**
 * Publish, schedule, unpublish, submit for review, withdraw from review, or
 * (for reviewers) send it back with requested changes and an optional note.
 * Sending for review again, publishing or scheduling clears that feedback.
 */
export async function transitionEntry(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
  input: {
    action: WorkflowAction;
    scheduledAt?: string | null;
    note?: string | null;
    expectedUpdatedAt: string;
  },
): Promise<EntryState & { previousStatus: EntryState["status"] }> {
  const note = String(input.note ?? "").trim();
  if (note.length > MAX_REVIEW_NOTE) {
    throw new EditorValidationError(
      `Keep the note to ${MAX_REVIEW_NOTE} characters or fewer.`,
      "review",
    );
  }
  return db.transaction(async (tx) => {
    const { role, entry, modelKey, modelFields } = await lockForEdit(
      tx,
      userId,
      siteId,
      entryId,
      input.expectedUpdatedAt,
    );
    const rules = await loadWorkflowRules(tx, siteId);
    if (!workflowActions(role, userId, entry, rules)[input.action]) {
      if (
        rules.requireReview &&
        (input.action === "publish" || input.action === "schedule") &&
        entry.status !== "in_review" &&
        workflowActions(role, userId, entry)[input.action]
      ) {
        throw new EditorValidationError(
          "This site requires a review before publishing. Request a review instead.",
          "review",
        );
      }
      throw new NotAllowedError("That change isn't available for this entry.");
    }
    if (input.action === "publish" || input.action === "schedule") {
      if (!entry.title.trim()) {
        throw new EditorValidationError("Add a title before publishing.", "title");
      }
      const missing = firstMissingRequired(modelFields, readFieldValues(modelFields, entry.data));
      if (missing) {
        throw new EditorValidationError(
          `Fill in “${missing.label}” before publishing. It's required.`,
          "fields",
          missing.key,
        );
      }
    }

    const now = new Date();
    let changes: Partial<typeof contentEntries.$inferInsert>;
    switch (input.action) {
      case "publish":
        changes = {
          status: "published",
          publishedAt: entry.publishedAt ?? now,
          scheduledAt: null,
          reviewFeedback: null,
          reviewRequestedById: null,
        };
        break;
      case "schedule": {
        const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
        const maxAhead = 5 * 365 * 24 * 60 * 60 * 1000;
        if (!when || Number.isNaN(when.getTime()) || when.getTime() < now.getTime() + 60_000) {
          throw new EditorValidationError("Pick a date and time in the future.", "scheduledAt");
        }
        if (when.getTime() > now.getTime() + maxAhead) {
          throw new EditorValidationError("Schedule within the next five years.", "scheduledAt");
        }
        changes = {
          status: "scheduled",
          scheduledAt: when,
          reviewFeedback: null,
          reviewRequestedById: null,
        };
        break;
      }
      case "unpublish":
        changes = { status: "draft", scheduledAt: null };
        break;
      case "submit":
        changes = { status: "in_review", reviewFeedback: null, reviewRequestedById: userId };
        break;
      case "withdraw":
        changes = { status: "draft", reviewRequestedById: null };
        break;
      case "request_changes": {
        const [reviewer] = await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        changes = {
          status: "draft",
          reviewRequestedById: null,
          reviewFeedback: {
            kind: "changes_requested",
            note,
            byId: userId,
            byName: reviewer?.name ?? "A reviewer",
            at: now.toISOString(),
          },
        };
        break;
      }
    }

    const [updated] = await tx
      .update(contentEntries)
      .set({ ...changes, updatedAt: now })
      .where(eq(contentEntries.id, entryId))
      .returning();

    if (input.action === "publish") {
      await tx.insert(contentRevisions).values({
        entryId,
        siteId,
        title: updated.title,
        slug: updated.slug,
        data: updated.data,
        seo: updated.seo,
        authorId: userId,
      });
    }
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: AUDIT_ACTION[input.action],
      targetType: "content_entry",
      targetId: entryId,
      metadata: {
        title: updated.title,
        from: entry.status,
        to: updated.status,
        ...(updated.scheduledAt ? { scheduledAt: updated.scheduledAt.toISOString() } : {}),
        ...(input.action === "request_changes" && note ? { note } : {}),
      },
    });
    const wasLive = entry.status === "published";
    const isLive = updated.status === "published";
    if (wasLive !== isLive) {
      const event = isLive ? "entry.published" : "entry.unpublished";
      await enqueueEntryEvent(tx, siteId, event, { ...updated, modelKey });
    }
    return { ...stateOf(updated), previousStatus: entry.status };
  });
}
