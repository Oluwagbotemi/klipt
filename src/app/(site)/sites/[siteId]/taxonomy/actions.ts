"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import {
  createTaxonomy,
  createTerm,
  deleteTaxonomy,
  deleteTerm,
  searchTerms,
  setEntryTerms,
  TaxonomyValidationError,
  updateTaxonomy,
  updateTerm,
} from "@/server/taxonomy";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { scheduleWebhookDelivery } from "@/lib/data/webhooks";
import { slugify } from "@/lib/content";
import { termSchema, type TermOption } from "@/lib/taxonomy";

/*
 * Taxonomy Server Actions. Terms need taxonomy.manage (authors may add tags
 * from the editor), custom taxonomies need models.manage, and assigning terms
 * needs the right to edit the entry. The server functions re-check all of it.
 */

const id = z.string().min(1).max(64);
const key = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);

type FieldErrors = Record<string, string | undefined>;

function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

function isPermissionError(error: unknown) {
  return error instanceof ForbiddenError || error instanceof NotAllowedError;
}

// ---------------------------------------------------------------------------
// Terms (Structure › Taxonomy)
// ---------------------------------------------------------------------------

export type TermValues = {
  name: string;
  slug: string;
  parentId: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
};
export interface TermFormState {
  values: TermValues;
  errors?: FieldErrors & { form?: string };
  saved?: { name: string; created: boolean };
}

export async function saveTermAction(
  _previous: TermFormState,
  formData: FormData,
): Promise<TermFormState> {
  const values: TermValues = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    parentId: String(formData.get("parentId") ?? ""),
    description: String(formData.get("description") ?? ""),
    seoTitle: String(formData.get("seoTitle") ?? ""),
    seoDescription: String(formData.get("seoDescription") ?? ""),
  };
  const ids = z.object({ siteId: id, taxonomyKey: key, termId: id.optional() }).safeParse({
    siteId: formData.get("siteId"),
    taxonomyKey: formData.get("taxonomyKey"),
    termId: formData.get("termId") || undefined,
  });
  if (!ids.success) return { values, errors: { form: "That taxonomy couldn't be found." } };
  const parsed = termSchema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };

  const { siteId, taxonomyKey, termId } = ids.data;
  try {
    const { user } = await requireSitePermission(siteId, "taxonomy.manage");
    const db = await getDb();
    if (termId) await updateTerm(db, user.id, siteId, termId, values);
    else await createTerm(db, user.id, siteId, taxonomyKey, values);
  } catch (error) {
    if (error instanceof TaxonomyValidationError) {
      return { values, errors: { [error.field]: error.message } };
    }
    if (isPermissionError(error)) {
      return { values, errors: { form: "Only editors, admins and owners can change terms." } };
    }
    throw error;
  }
  if (termId) scheduleWebhookDelivery(siteId, { settle: true });
  refresh();
  return { values, saved: { name: parsed.data.name, created: !termId } };
}

export async function deleteTermAction(
  siteId: string,
  termId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = z.object({ siteId: id, termId: id }).safeParse({ siteId, termId });
  if (!ids.success) return { ok: false, error: "That term couldn't be found." };
  try {
    const { user } = await requireSitePermission(siteId, "taxonomy.manage");
    await deleteTerm(await getDb(), user.id, siteId, termId);
  } catch (error) {
    if (isPermissionError(error)) {
      return { ok: false, error: "Only editors, admins and owners can delete terms." };
    }
    throw error;
  }
  scheduleWebhookDelivery(siteId, { settle: true });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Custom taxonomies
// ---------------------------------------------------------------------------

export type TaxonomyValues = {
  name: string;
  key: string;
  description: string;
  hierarchical: boolean;
  modelKeys: string[];
};
export interface TaxonomyFormState {
  values: TaxonomyValues;
  errors?: FieldErrors & { form?: string };
  saved?: { name: string; key: string; created: boolean };
}

const NO_MODELS_PERMISSION = "Only owners and admins can change custom taxonomies.";

export async function saveTaxonomyAction(
  _previous: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const values: TaxonomyValues = {
    name: String(formData.get("name") ?? ""),
    key: String(formData.get("key") ?? ""),
    description: String(formData.get("description") ?? ""),
    hierarchical: formData.get("hierarchical") === "yes",
    modelKeys: formData.getAll("modelKeys").map(String),
  };
  const ids = z.object({ siteId: id, taxonomyId: id.optional() }).safeParse({
    siteId: formData.get("siteId"),
    taxonomyId: formData.get("taxonomyId") || undefined,
  });
  if (!ids.success) return { values, errors: { form: "That site couldn't be found." } };
  const { siteId, taxonomyId } = ids.data;
  try {
    const { user } = await requireSitePermission(siteId, "models.manage");
    const db = await getDb();
    if (taxonomyId) await updateTaxonomy(db, user.id, siteId, taxonomyId, values);
    else await createTaxonomy(db, user.id, siteId, values);
  } catch (error) {
    if (error instanceof TaxonomyValidationError) {
      return { values, errors: { [error.field]: error.message } };
    }
    if (isPermissionError(error)) return { values, errors: { form: NO_MODELS_PERMISSION } };
    throw error;
  }
  refresh();
  return { values, saved: { name: values.name.trim(), key: values.key, created: !taxonomyId } };
}

export async function deleteTaxonomyAction(
  siteId: string,
  taxonomyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = z.object({ siteId: id, taxonomyId: id }).safeParse({ siteId, taxonomyId });
  if (!ids.success) return { ok: false, error: "That taxonomy couldn't be found." };
  try {
    const { user } = await requireSitePermission(siteId, "models.manage");
    await deleteTaxonomy(await getDb(), user.id, siteId, taxonomyId);
  } catch (error) {
    if (error instanceof TaxonomyValidationError) return { ok: false, error: error.message };
    if (isPermissionError(error)) return { ok: false, error: NO_MODELS_PERMISSION };
    throw error;
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Editor panel. These never call refresh(): the editor keeps its own state.
// ---------------------------------------------------------------------------

export type EntryTermsResult = { ok: true; termIds: string[] } | { ok: false; error: string };

export async function setEntryTermsAction(
  siteId: string,
  entryId: string,
  taxonomyKey: string,
  termIds: string[],
): Promise<EntryTermsResult> {
  const input = z
    .object({ siteId: id, entryId: id, taxonomyKey: key, termIds: z.array(id).max(50) })
    .safeParse({ siteId, entryId, taxonomyKey, termIds });
  if (!input.success) return { ok: false, error: "Those terms couldn't be saved." };
  try {
    const { user } = await requireSitePermission(siteId, "content.create");
    const saved = await setEntryTerms(
      await getDb(),
      user.id,
      siteId,
      entryId,
      taxonomyKey,
      input.data.termIds,
    );
    scheduleWebhookDelivery(siteId, { settle: true });
    return { ok: true, termIds: saved };
  } catch (error) {
    if (error instanceof TaxonomyValidationError) return { ok: false, error: error.message };
    if (isPermissionError(error)) {
      return { ok: false, error: "You can't change the terms of this entry." };
    }
    throw error;
  }
}

export async function searchTermsAction(
  siteId: string,
  taxonomyKey: string,
  query: string,
): Promise<TermOption[]> {
  const input = z
    .object({ siteId: id, taxonomyKey: key, query: z.string().max(80) })
    .safeParse({ siteId, taxonomyKey, query });
  if (!input.success) return [];
  const { user } = await requireSitePermission(siteId, "site.view");
  return searchTerms(await getDb(), user.id, siteId, taxonomyKey, query);
}

/** Creates a term from the editor by name (authors: tags only). Returns the existing one if the slug is taken. */
export async function createTermFromEditorAction(
  siteId: string,
  taxonomyKey: string,
  name: string,
): Promise<{ ok: true; term: TermOption } | { ok: false; error: string }> {
  const input = z
    .object({ siteId: id, taxonomyKey: key, name: z.string().trim().min(1).max(80) })
    .safeParse({ siteId, taxonomyKey, name });
  if (!input.success) return { ok: false, error: "Enter a name of up to 80 characters." };
  const slug = slugify(input.data.name);
  try {
    const { user } = await requireSitePermission(siteId, "content.create");
    const db = await getDb();
    const existing = (await searchTerms(db, user.id, siteId, taxonomyKey, slug, 50)).find(
      (term) => term.slug === slug,
    );
    if (existing) return { ok: true, term: existing };
    const term = await createTerm(db, user.id, siteId, taxonomyKey, {
      name: input.data.name,
      slug,
      parentId: "",
      description: "",
      seoTitle: "",
      seoDescription: "",
    });
    return { ok: true, term };
  } catch (error) {
    if (error instanceof TaxonomyValidationError) return { ok: false, error: error.message };
    if (isPermissionError(error)) return { ok: false, error: "You can't add terms here." };
    throw error;
  }
}
