import { and, asc, count, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import {
  auditEvents,
  contentEntries,
  contentModels,
  mediaAssets,
  type ContentFieldDefinition,
} from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import {
  fieldListSchema,
  FieldValueError,
  modelDetailsSchema,
  newModelSchema,
  type FieldRefs,
  type FieldValue,
  type LinkTarget,
  type ModelSummary,
} from "@/lib/models";
import { can } from "@/lib/permissions";
import { entryPath } from "@/lib/seo";

/*
 * Content models (content types) and their fields. Every member can read
 * them; changing them needs models.manage. Field values live in
 * content_entries.data[fieldKey]; this file also checks values that point at
 * other records (images, linked entries) and resolves them for display.
 */

export class ModelValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

export class ModelConflictError extends Error {
  constructor() {
    super("Someone else changed this content type since you opened it. Reload to see the latest.");
  }
}

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  return role;
}

async function requireManager(db: DbOrTx, userId: string, siteId: string) {
  const role = await requireRole(db, userId, siteId);
  if (!can(role, "models.manage")) throw new NotAllowedError("Can't change content types.");
}

async function summaries(db: DbOrTx, siteId: string, modelId?: string): Promise<ModelSummary[]> {
  const rows = await db
    .select({
      id: contentModels.id,
      key: contentModels.key,
      name: contentModels.name,
      description: contentModels.description,
      schemaType: contentModels.schemaType,
      isSystem: contentModels.isSystem,
      fields: contentModels.fields,
      updatedAt: contentModels.updatedAt,
      entryCount: count(contentEntries.id),
    })
    .from(contentModels)
    .leftJoin(contentEntries, eq(contentEntries.modelId, contentModels.id))
    .where(
      and(eq(contentModels.siteId, siteId), modelId ? eq(contentModels.id, modelId) : undefined),
    )
    .groupBy(contentModels.id)
    .orderBy(desc(contentModels.isSystem), asc(contentModels.name));
  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    entryCount: Number(row.entryCount),
  }));
}

/** All content types of the site (built-in first), with how many entries each has. */
export async function listModels(db: DbOrTx, userId: string, siteId: string) {
  await requireRole(db, userId, siteId);
  return summaries(db, siteId);
}

export async function getModel(db: DbOrTx, userId: string, siteId: string, modelId: string) {
  await requireRole(db, userId, siteId);
  const [model] = await summaries(db, siteId, modelId);
  return model ?? null;
}

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  const issue = error.issues[0];
  return new ModelValidationError(issue.message, String(issue.path[0] ?? "form"));
}

export async function createModel(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: { name: string; key: string; description: string; schemaType: string },
): Promise<{ id: string }> {
  await requireManager(db, userId, siteId);
  const parsed = newModelSchema.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  const { key, ...details } = parsed.data;
  try {
    return await db.transaction(async (tx) => {
      const [model] = await tx
        .insert(contentModels)
        .values({ siteId, key, ...details, fields: [] })
        .returning({ id: contentModels.id });
      await tx.insert(auditEvents).values({
        siteId,
        actorId: userId,
        action: "model.created",
        targetType: "content_model",
        targetId: model.id,
        metadata: { key, name: details.name },
      });
      return model;
    });
  } catch (error) {
    if (isUniqueViolation(error, "content_models_site_key_unique")) {
      throw new ModelValidationError("Another content type already uses this key.", "key");
    }
    throw error;
  }
}

async function lockModel(tx: DbOrTx, siteId: string, modelId: string, expectedUpdatedAt: string) {
  const [model] = await tx
    .select()
    .from(contentModels)
    .where(and(eq(contentModels.siteId, siteId), eq(contentModels.id, modelId)))
    .for("update")
    .limit(1);
  if (!model) throw new NotAllowedError("Content type not found.");
  if (model.updatedAt.toISOString() !== expectedUpdatedAt) throw new ModelConflictError();
  return model;
}

/** Name, description and schema.org type. Built-in types keep their name. */
export async function updateModelDetails(
  db: DbOrTx,
  userId: string,
  siteId: string,
  modelId: string,
  input: { name: string; description: string; schemaType: string; expectedUpdatedAt: string },
): Promise<{ updatedAt: string }> {
  await requireManager(db, userId, siteId);
  const parsed = modelDetailsSchema.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  return db.transaction(async (tx) => {
    const model = await lockModel(tx, siteId, modelId, input.expectedUpdatedAt);
    const name = model.isSystem ? model.name : parsed.data.name;
    const [updated] = await tx
      .update(contentModels)
      .set({ ...parsed.data, name, updatedAt: new Date() })
      .where(eq(contentModels.id, modelId))
      .returning({ updatedAt: contentModels.updatedAt });
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "model.updated",
      targetType: "content_model",
      targetId: modelId,
      metadata: {
        key: model.key,
        name,
        description: parsed.data.description,
        schemaType: parsed.data.schemaType,
      },
    });
    return { updatedAt: updated.updatedAt.toISOString() };
  });
}

/**
 * Replaces the model's field list (add, edit, remove, reorder in one go).
 * Keys of existing fields can't change, and neither can their type, so stored
 * values keep their meaning. Values of removed fields stay in the database.
 */
export async function saveModelFields(
  db: DbOrTx,
  userId: string,
  siteId: string,
  modelId: string,
  input: { fields: unknown; expectedUpdatedAt: string },
): Promise<{ updatedAt: string; fields: ContentFieldDefinition[] }> {
  await requireManager(db, userId, siteId);
  const parsed = fieldListSchema.safeParse(input.fields);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = typeof issue.path[0] === "number" ? issue.path[0] : null;
    const label =
      index !== null && Array.isArray(input.fields)
        ? (input.fields[index] as { label?: string })?.label
        : null;
    throw new ModelValidationError(label ? `${label}: ${issue.message}` : issue.message, "fields");
  }
  const fields = parsed.data;

  return db.transaction(async (tx) => {
    const model = await lockModel(tx, siteId, modelId, input.expectedUpdatedAt);
    const before = new Map(model.fields.map((field) => [field.key, field]));
    for (const field of fields) {
      const previous = before.get(field.key);
      if (previous && previous.type !== field.type) {
        throw new ModelValidationError(
          `${field.label}: a field's type can't change. Remove it and add a new field instead.`,
          "fields",
        );
      }
    }
    const linked = [...new Set(fields.flatMap((field) => field.referenceModelKeys ?? []))];
    if (linked.length > 0) {
      const existing = await tx
        .select({ key: contentModels.key })
        .from(contentModels)
        .where(and(eq(contentModels.siteId, siteId), inArray(contentModels.key, linked)));
      const known = new Set(existing.map((row) => row.key));
      const missing = linked.find((key) => !known.has(key));
      if (missing) {
        throw new ModelValidationError(
          `There's no content type “${missing}” to link to.`,
          "fields",
        );
      }
    }

    const [updated] = await tx
      .update(contentModels)
      .set({ fields, updatedAt: new Date() })
      .where(eq(contentModels.id, modelId))
      .returning({ updatedAt: contentModels.updatedAt });
    const after = new Set(fields.map((field) => field.key));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "model.fields_updated",
      targetType: "content_model",
      targetId: modelId,
      metadata: {
        key: model.key,
        added: fields.filter((field) => !before.has(field.key)).map((field) => field.key),
        removed: [...before.keys()].filter((key) => !after.has(key)),
        fields: fields.map((field) => field.key),
      },
    });
    return { updatedAt: updated.updatedAt.toISOString(), fields };
  });
}

export class ModelInUseError extends Error {}

/** Deletes a custom content type that has no entries and isn't linked from another type. */
export async function deleteModel(
  db: DbOrTx,
  userId: string,
  siteId: string,
  modelId: string,
): Promise<void> {
  await requireManager(db, userId, siteId);
  await db.transaction(async (tx) => {
    const [model] = await tx
      .select()
      .from(contentModels)
      .where(and(eq(contentModels.siteId, siteId), eq(contentModels.id, modelId)))
      .for("update")
      .limit(1);
    if (!model) throw new NotAllowedError("Content type not found.");
    if (model.isSystem) throw new ModelInUseError("Built-in content types can't be deleted.");

    const [{ n }] = await tx
      .select({ n: count() })
      .from(contentEntries)
      .where(eq(contentEntries.modelId, modelId));
    if (Number(n) > 0) {
      const entries = Number(n) === 1 ? "1 entry" : `${n} entries`;
      throw new ModelInUseError(
        `${model.name} still has ${entries} (including archived ones). Delete them in Content first.`,
      );
    }
    const others = await tx
      .select({ name: contentModels.name, fields: contentModels.fields })
      .from(contentModels)
      .where(and(eq(contentModels.siteId, siteId), ne(contentModels.id, modelId)));
    for (const other of others) {
      const field = other.fields.find((item) => item.referenceModelKeys?.includes(model.key));
      if (field) {
        throw new ModelInUseError(
          `${other.name}’s “${field.label}” field links to ${model.name}. Change that field first.`,
        );
      }
    }

    await tx.delete(contentModels).where(eq(contentModels.id, modelId));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "model.deleted",
      targetType: "content_model",
      targetId: modelId,
      metadata: { key: model.key, name: model.name },
    });
  });
}

/**
 * Checks that image and link values point at records of this site: an image
 * from the media library, and an entry of one of the field's allowed types.
 */
export async function assertFieldTargets(
  db: DbOrTx,
  siteId: string,
  entryId: string,
  fields: ContentFieldDefinition[],
  values: Record<string, FieldValue>,
) {
  const mediaFields = fields.filter((field) => field.type === "media" && field.key in values);
  const refFields = fields.filter((field) => field.type === "reference" && field.key in values);

  if (mediaFields.length > 0) {
    const ids = mediaFields.map((field) => String(values[field.key]));
    const rows = await db
      .select({ id: mediaAssets.id, mimeType: mediaAssets.mimeType })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.siteId, siteId), inArray(mediaAssets.id, ids)));
    const images = new Set(
      rows.filter((row) => row.mimeType.startsWith("image/")).map((row) => row.id),
    );
    for (const field of mediaFields) {
      if (!images.has(String(values[field.key]))) {
        throw new FieldValueError(
          `${field.label}: choose an image from the media library.`,
          field.key,
        );
      }
    }
  }

  if (refFields.length > 0) {
    const ids = refFields.map((field) => String(values[field.key]));
    const rows = await db
      .select({ id: contentEntries.id, modelKey: contentModels.key })
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .where(and(eq(contentEntries.siteId, siteId), inArray(contentEntries.id, ids)));
    const keyOf = new Map(rows.map((row) => [row.id, row.modelKey]));
    for (const field of refFields) {
      const target = String(values[field.key]);
      const modelKey = keyOf.get(target);
      if (target === entryId) {
        throw new FieldValueError(`${field.label}: an entry can't link to itself.`, field.key);
      }
      if (!modelKey || !field.referenceModelKeys?.includes(modelKey)) {
        throw new FieldValueError(`${field.label}: choose one of the listed entries.`, field.key);
      }
    }
  }
}

/** Titles and thumbnails for the editor's Fields panel. */
export async function fieldRefsFor(
  db: DbOrTx,
  siteId: string,
  fields: ContentFieldDefinition[],
  values: Record<string, FieldValue>,
): Promise<FieldRefs> {
  const idsOf = (type: ContentFieldDefinition["type"]) =>
    fields
      .filter((field) => field.type === type && typeof values[field.key] === "string")
      .map((field) => String(values[field.key]));
  const refs: FieldRefs = { media: {}, entries: {} };
  const mediaIds = idsOf("media");
  if (mediaIds.length > 0) {
    const rows = await db
      .select({
        id: mediaAssets.id,
        url: mediaAssets.url,
        altText: mediaAssets.altText,
        filename: mediaAssets.filename,
      })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.siteId, siteId), inArray(mediaAssets.id, mediaIds)));
    for (const { id, ...rest } of rows) refs.media[id] = rest;
  }
  const entryIds = idsOf("reference");
  if (entryIds.length > 0) {
    const rows = await db
      .select({
        id: contentEntries.id,
        title: contentEntries.title,
        status: contentEntries.status,
        modelName: contentModels.name,
      })
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .where(and(eq(contentEntries.siteId, siteId), inArray(contentEntries.id, entryIds)));
    for (const { id, ...rest } of rows) refs.entries[id] = rest;
  }
  return refs;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Entries a link field can point at, for the editor's picker (any status but archived). */
export async function searchLinkTargets(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: { modelKeys: string[]; q: string; excludeId?: string },
): Promise<LinkTarget[]> {
  await requireRole(db, userId, siteId);
  const keys = input.modelKeys.slice(0, 20);
  if (keys.length === 0) return [];
  const q = input.q.trim().slice(0, 100);
  const needle = q ? `%${escapeLike(q)}%` : null;
  const rows = await db
    .select({
      id: contentEntries.id,
      title: contentEntries.title,
      slug: contentEntries.slug,
      status: contentEntries.status,
      modelKey: contentModels.key,
      modelName: contentModels.name,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(
      and(
        eq(contentEntries.siteId, siteId),
        inArray(contentModels.key, keys),
        ne(contentEntries.status, "archived"),
        input.excludeId ? ne(contentEntries.id, input.excludeId) : undefined,
        needle
          ? or(ilike(contentEntries.title, needle), ilike(contentEntries.slug, needle))
          : undefined,
      ),
    )
    .orderBy(desc(contentEntries.updatedAt))
    .limit(20);
  return rows.map(({ slug, modelKey, ...row }) => ({ ...row, path: entryPath(modelKey, slug) }));
}
