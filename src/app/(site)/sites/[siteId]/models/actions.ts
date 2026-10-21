"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import {
  createModel,
  deleteModel,
  ModelConflictError,
  ModelInUseError,
  ModelValidationError,
  saveModelFields,
  updateModelDetails,
} from "@/server/models";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { modelDetailsSchema, newModelSchema, type ContentFieldDefinition } from "@/lib/models";
import { siteHref } from "@/lib/navigation";

/*
 * Content model Server Actions. Every one needs models.manage (owners and
 * admins); the server functions check it again inside their transaction.
 */

const id = z.string().min(1).max(64);
const version = z.string().min(1).max(40);
const NO_PERMISSION = "Only owners and admins can change content types.";

type FieldErrors = Record<string, string | undefined>;
export interface ModelFormState<V> {
  values: V;
  errors?: FieldErrors & { form?: string };
  saved?: boolean;
  /** New version after a save, for the next optimistic-locking check. */
  updatedAt?: string;
}

function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

function isPermissionError(error: unknown) {
  return error instanceof ForbiddenError || error instanceof NotAllowedError;
}

export type NewModelValues = { name: string; key: string; description: string; schemaType: string };

export async function createModelAction(
  _previous: ModelFormState<NewModelValues>,
  formData: FormData,
): Promise<ModelFormState<NewModelValues>> {
  const values = {
    name: String(formData.get("name") ?? ""),
    key: String(formData.get("key") ?? ""),
    description: String(formData.get("description") ?? ""),
    schemaType: String(formData.get("schemaType") ?? ""),
  };
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  const parsed = newModelSchema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };

  let modelId: string;
  try {
    const { user } = await requireSitePermission(siteId.data, "models.manage");
    modelId = (await createModel(await getDb(), user.id, siteId.data, values)).id;
  } catch (error) {
    if (error instanceof ModelValidationError) {
      return { values, errors: { [error.field]: error.message } };
    }
    if (isPermissionError(error)) return { values, errors: { form: NO_PERMISSION } };
    throw error;
  }
  redirect(`${siteHref(siteId.data, "models")}/${modelId}`);
}

export type ModelDetailsValues = { name: string; description: string; schemaType: string };

export async function updateModelDetailsAction(
  _previous: ModelFormState<ModelDetailsValues>,
  formData: FormData,
): Promise<ModelFormState<ModelDetailsValues>> {
  const values = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    schemaType: String(formData.get("schemaType") ?? ""),
  };
  const ids = z
    .object({ siteId: id, modelId: id, expectedUpdatedAt: version })
    .safeParse(Object.fromEntries(formData));
  if (!ids.success) return { values, errors: { form: "That content type couldn't be found." } };
  const parsed = modelDetailsSchema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };

  try {
    const { siteId, modelId, expectedUpdatedAt } = ids.data;
    const { user } = await requireSitePermission(siteId, "models.manage");
    const { updatedAt } = await updateModelDetails(await getDb(), user.id, siteId, modelId, {
      ...values,
      expectedUpdatedAt,
    });
    refresh();
    return { values, saved: true, updatedAt };
  } catch (error) {
    if (error instanceof ModelValidationError) {
      return { values, errors: { [error.field]: error.message } };
    }
    if (error instanceof ModelConflictError) return { values, errors: { form: error.message } };
    if (isPermissionError(error)) return { values, errors: { form: NO_PERMISSION } };
    throw error;
  }
}

export type SaveFieldsResult =
  | { ok: true; updatedAt: string; fields: ContentFieldDefinition[] }
  | { ok: false; error: string; conflict?: boolean };

/** Saves the whole field list (add, edit, remove, reorder). */
export async function saveModelFieldsAction(
  siteId: string,
  modelId: string,
  input: { fields: unknown; expectedUpdatedAt: string },
): Promise<SaveFieldsResult> {
  const ids = z
    .object({ siteId: id, modelId: id, expectedUpdatedAt: version })
    .safeParse({ siteId, modelId, expectedUpdatedAt: input?.expectedUpdatedAt });
  if (!ids.success) return { ok: false, error: "That content type couldn't be found." };
  try {
    const { user } = await requireSitePermission(siteId, "models.manage");
    const result = await saveModelFields(await getDb(), user.id, siteId, modelId, {
      fields: input.fields,
      expectedUpdatedAt: ids.data.expectedUpdatedAt,
    });
    refresh();
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ModelValidationError) return { ok: false, error: error.message };
    if (error instanceof ModelConflictError) {
      return { ok: false, error: error.message, conflict: true };
    }
    if (isPermissionError(error)) return { ok: false, error: NO_PERMISSION };
    throw error;
  }
}

export async function deleteModelAction(
  siteId: string,
  modelId: string,
): Promise<{ error: string }> {
  if (!id.safeParse(siteId).success || !id.safeParse(modelId).success) {
    return { error: "That content type couldn't be found." };
  }
  try {
    const { user } = await requireSitePermission(siteId, "models.manage");
    await deleteModel(await getDb(), user.id, siteId, modelId);
  } catch (error) {
    if (error instanceof ModelInUseError) return { error: error.message };
    if (isPermissionError(error)) return { error: NO_PERMISSION };
    throw error;
  }
  redirect(siteHref(siteId, "models"));
}
