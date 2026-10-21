import { z } from "zod";
import { RESERVED_MODEL_KEYS } from "@/lib/models";
import { can } from "@/lib/permissions";
import { slugSchema } from "@/lib/seo";
import type { SiteRole } from "@/lib/types";

/*
 * Taxonomy: categories, tags and custom groupings (client-safe; the server
 * re-validates). Every site has the system "category" (nested) and "tag"
 * taxonomies; custom ones apply to the content types they list.
 *
 * Who can do what:
 * - taxonomy.manage (owners, admins, editors) create, edit and delete terms.
 * - models.manage (owners, admins) create, edit and delete custom taxonomies.
 * - Anyone who can edit an entry assigns existing terms to it. Authors may
 *   also create new tags while doing so (tags only: categories and custom
 *   terms shape the site's structure, so editors look after them).
 */

export const SYSTEM_TAXONOMIES = [
  {
    key: "category",
    name: "Categories",
    description: "Group entries by topic. Categories can be nested.",
    hierarchical: true,
  },
  {
    key: "tag",
    name: "Tags",
    description: "Free-form labels for finding related entries.",
    hierarchical: false,
  },
] as const;

/** Levels a hierarchical taxonomy can have (a top-level term is level 1). */
export const MAX_TERM_DEPTH = 3;
/** Terms one entry can have in one taxonomy. */
export const MAX_TERMS_PER_ENTRY = 50;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} to ${max} characters.`)
    .transform((value) => value || null);

export const termSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80, "Keep the name to 80 characters."),
  slug: slugSchema,
  description: optionalText(500, "description"),
  parentId: z
    .string()
    .max(64)
    .transform((value) => value || null),
  seoTitle: optionalText(70, "SEO title"),
  seoDescription: optionalText(160, "meta description"),
});
export type TermInput = z.input<typeof termSchema>;

export const taxonomyKeySchema = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9-]{1,39}$/,
    "Use 2–40 lowercase letters, numbers and hyphens, starting with a letter.",
  )
  .refine((key) => !RESERVED_MODEL_KEYS.has(key), "That key is reserved. Choose another.");

export const taxonomyDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the taxonomy a name, e.g. Regions.")
    .max(60, "Keep the name to 60 characters."),
  description: optionalText(200, "description"),
  modelKeys: z.array(z.string().max(40)).max(50),
});
export const newTaxonomySchema = taxonomyDetailsSchema.extend({
  key: taxonomyKeySchema,
  hierarchical: z.boolean(),
});

/** Public archive path of a term: /category/slug, /tag/slug, /region/slug. */
export function termPath(taxonomyKey: string, slug: string): string {
  return `/${taxonomyKey}/${slug}`;
}

/** Whether a taxonomy is offered on entries of this content type. */
export function appliesTo(taxonomy: { isSystem: boolean; modelKeys: string[] }, modelKey: string) {
  return taxonomy.isSystem || taxonomy.modelKeys.includes(modelKey);
}

/** Whether `role` may create a term in this taxonomy (authors: tags only). */
export function canCreateTerm(role: SiteRole, taxonomyKey: string): boolean {
  return can(role, "taxonomy.manage") || (taxonomyKey === "tag" && can(role, "content.create"));
}

export interface TaxonomySummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  hierarchical: boolean;
  isSystem: boolean;
  /** Content types that use it (custom taxonomies; system ones apply to every type). */
  modelKeys: string[];
  termCount: number;
}

export interface TermSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Entries of any status that have this term. */
  entryCount: number;
}

/** A term as the editor shows it. */
export interface TermOption {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

/** One taxonomy in the editor's "Categories & tags" panel. */
export interface EntryTaxonomy {
  key: string;
  name: string;
  hierarchical: boolean;
  /** All terms (hierarchical) or only the assigned ones (flat; others come from search). */
  terms: TermOption[];
  selected: string[];
  canCreate: boolean;
}

/**
 * Orders terms parent-first (siblings by name) and adds their depth (0 =
 * top level). Terms whose parent is missing are treated as top level.
 */
export function flattenTree<T extends { id: string; name: string; parentId: string | null }>(
  terms: T[],
): (T & { depth: number })[] {
  const ids = new Set(terms.map((term) => term.id));
  const children = new Map<string | null, T[]>();
  for (const term of terms) {
    const parent = term.parentId && ids.has(term.parentId) ? term.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), term]);
  }
  const out: (T & { depth: number })[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    const list = [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const term of list) {
      if (seen.has(term.id)) continue;
      seen.add(term.id);
      out.push({ ...term, depth });
      walk(term.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Ids of `id` and everything below it. */
export function descendantIds(terms: { id: string; parentId: string | null }[], id: string) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const term of terms) {
      if (term.parentId && out.has(term.parentId) && !out.has(term.id)) {
        out.add(term.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Search match for term lists: name or slug contains `query` (already lower-cased). */
export function matchesTerm(term: { name: string; slug: string }, query: string) {
  return term.name.toLowerCase().includes(query) || term.slug.includes(query);
}
