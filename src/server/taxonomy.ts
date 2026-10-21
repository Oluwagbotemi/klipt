import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import {
  auditEvents,
  contentEntries,
  contentModels,
  entryTerms,
  taxonomies,
  terms,
} from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import { enqueueEntryEvent } from "@/server/webhooks";
import { canEditEntry } from "@/lib/content";
import { can, type SitePermission } from "@/lib/permissions";
import {
  appliesTo,
  canCreateTerm,
  descendantIds,
  MAX_TERM_DEPTH,
  MAX_TERMS_PER_ENTRY,
  newTaxonomySchema,
  taxonomyDetailsSchema,
  termSchema,
  type EntryTaxonomy,
  type TaxonomySummary,
  type TermInput,
  type TermOption,
  type TermSummary,
} from "@/lib/taxonomy";

/*
 * Taxonomies and their terms. Every member can read them; terms need
 * taxonomy.manage (authors may add tags, see canCreateTerm), custom
 * taxonomies need models.manage. Assigning terms to an entry needs the right
 * to edit that entry, and is its own small write: it never changes the
 * entry's version, so it can't conflict with the editor's autosave.
 */

export class TaxonomyValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
  }
}

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  return role;
}

async function requirePermission(
  db: DbOrTx,
  userId: string,
  siteId: string,
  permission: SitePermission,
) {
  const role = await requireRole(db, userId, siteId);
  if (!can(role, permission)) throw new NotAllowedError(`Missing ${permission}.`);
  return role;
}

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  const issue = error.issues[0];
  return new TaxonomyValidationError(issue.message, String(issue.path[0] ?? "form"));
}

// ---------------------------------------------------------------------------
// Taxonomies
// ---------------------------------------------------------------------------

async function taxonomySummaries(db: DbOrTx, siteId: string): Promise<TaxonomySummary[]> {
  const rows = await db
    .select({
      id: taxonomies.id,
      key: taxonomies.key,
      name: taxonomies.name,
      description: taxonomies.description,
      hierarchical: taxonomies.hierarchical,
      isSystem: taxonomies.isSystem,
      modelKeys: taxonomies.modelKeys,
      termCount: count(terms.id),
    })
    .from(taxonomies)
    .leftJoin(terms, eq(terms.taxonomyId, taxonomies.id))
    .where(eq(taxonomies.siteId, siteId))
    .groupBy(taxonomies.id)
    .orderBy(desc(taxonomies.isSystem), asc(taxonomies.key));
  return rows.map((row) => ({
    ...row,
    modelKeys: row.isSystem ? [] : row.modelKeys,
    termCount: Number(row.termCount),
  }));
}

/** Categories and Tags first, then custom taxonomies by key. */
export async function listTaxonomies(db: DbOrTx, userId: string, siteId: string) {
  await requireRole(db, userId, siteId);
  return taxonomySummaries(db, siteId);
}

async function findTaxonomy(db: DbOrTx, siteId: string, key: string) {
  const [row] = await db
    .select()
    .from(taxonomies)
    .where(and(eq(taxonomies.siteId, siteId), eq(taxonomies.key, key)))
    .limit(1);
  return row ?? null;
}

async function checkModelKeys(db: DbOrTx, siteId: string, modelKeys: string[]) {
  const unique = [...new Set(modelKeys)];
  if (unique.length === 0) return unique;
  const rows = await db
    .select({ key: contentModels.key })
    .from(contentModels)
    .where(and(eq(contentModels.siteId, siteId), inArray(contentModels.key, unique)));
  if (rows.length !== unique.length) {
    throw new TaxonomyValidationError("Choose content types from the list.", "modelKeys");
  }
  return unique;
}

export async function createTaxonomy(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: {
    name: string;
    key: string;
    description: string;
    hierarchical: boolean;
    modelKeys: string[];
  },
): Promise<{ id: string; key: string }> {
  await requirePermission(db, userId, siteId, "models.manage");
  const parsed = newTaxonomySchema.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  const { key, ...details } = parsed.data;
  try {
    return await db.transaction(async (tx) => {
      // Both become URL prefixes (/region/…), so a taxonomy can't share a content type's key.
      const [model] = await tx
        .select({ id: contentModels.id })
        .from(contentModels)
        .where(and(eq(contentModels.siteId, siteId), eq(contentModels.key, key)))
        .limit(1);
      if (model) {
        throw new TaxonomyValidationError("A content type already uses this key.", "key");
      }
      const modelKeys = await checkModelKeys(tx, siteId, details.modelKeys);
      const [row] = await tx
        .insert(taxonomies)
        .values({ siteId, key, ...details, modelKeys })
        .returning({ id: taxonomies.id, key: taxonomies.key });
      await tx.insert(auditEvents).values({
        siteId,
        actorId: userId,
        action: "taxonomy.created",
        targetType: "taxonomy",
        targetId: row.id,
        metadata: { key, name: details.name },
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error, "taxonomies_site_key_unique")) {
      throw new TaxonomyValidationError("Another taxonomy already uses this key.", "key");
    }
    throw error;
  }
}

/** Name, description and content types of a custom taxonomy (the key and nesting are fixed). */
export async function updateTaxonomy(
  db: DbOrTx,
  userId: string,
  siteId: string,
  taxonomyId: string,
  input: { name: string; description: string; modelKeys: string[] },
) {
  await requirePermission(db, userId, siteId, "models.manage");
  const parsed = taxonomyDetailsSchema.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(taxonomies)
      .where(and(eq(taxonomies.siteId, siteId), eq(taxonomies.id, taxonomyId)))
      .for("update")
      .limit(1);
    if (!row) throw new NotAllowedError("Taxonomy not found.");
    if (row.isSystem) {
      throw new TaxonomyValidationError("Categories and Tags are built in.", "form");
    }
    const modelKeys = await checkModelKeys(tx, siteId, parsed.data.modelKeys);
    await tx
      .update(taxonomies)
      .set({ ...parsed.data, modelKeys })
      .where(eq(taxonomies.id, taxonomyId));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "taxonomy.updated",
      targetType: "taxonomy",
      targetId: taxonomyId,
      metadata: { key: row.key, name: parsed.data.name },
    });
  });
}

/** Deletes a custom taxonomy and its terms. Entries are kept; they just lose those terms. */
export async function deleteTaxonomy(
  db: DbOrTx,
  userId: string,
  siteId: string,
  taxonomyId: string,
) {
  await requirePermission(db, userId, siteId, "models.manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(taxonomies)
      .where(and(eq(taxonomies.siteId, siteId), eq(taxonomies.id, taxonomyId)))
      .for("update")
      .limit(1);
    if (!row) throw new NotAllowedError("Taxonomy not found.");
    if (row.isSystem) {
      throw new TaxonomyValidationError("Categories and Tags can't be deleted.", "form");
    }
    await tx.delete(taxonomies).where(eq(taxonomies.id, taxonomyId));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "taxonomy.deleted",
      targetType: "taxonomy",
      targetId: taxonomyId,
      metadata: { key: row.key, name: row.name },
    });
  });
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** Every term of a taxonomy with how many entries (any status) have it. */
export async function listTerms(
  db: DbOrTx,
  userId: string,
  siteId: string,
  taxonomyKey: string,
): Promise<{ taxonomy: TaxonomySummary; terms: TermSummary[] } | null> {
  await requireRole(db, userId, siteId);
  const taxonomy = (await taxonomySummaries(db, siteId)).find((row) => row.key === taxonomyKey);
  if (!taxonomy) return null;
  const rows = await db
    .select({
      id: terms.id,
      name: terms.name,
      slug: terms.slug,
      description: terms.description,
      parentId: terms.parentId,
      seoTitle: terms.seoTitle,
      seoDescription: terms.seoDescription,
      entryCount: count(entryTerms.entryId),
    })
    .from(terms)
    .leftJoin(entryTerms, eq(entryTerms.termId, terms.id))
    .where(eq(terms.taxonomyId, taxonomy.id))
    .groupBy(terms.id)
    .orderBy(asc(terms.name));
  return {
    taxonomy,
    terms: rows.map((row) => ({ ...row, entryCount: Number(row.entryCount) })),
  };
}

type TermRow = { id: string; parentId: string | null };

/** Level of a term (1 = top level), following parents. */
function levelOf(all: TermRow[], id: string): number {
  const byId = new Map(all.map((term) => [term.id, term]));
  let level = 0;
  for (let current = byId.get(id); current; current = byId.get(current.parentId ?? "")) {
    level += 1;
    if (level > all.length) break;
  }
  return level;
}

/** Levels in the subtree below and including `id` (1 for a leaf). */
function heightOf(all: TermRow[], id: string): number {
  const children = all.filter((term) => term.parentId === id);
  return 1 + Math.max(0, ...children.map((child) => heightOf(all, child.id)));
}

/** Validates a parent for a term in a hierarchical taxonomy (no cycles, at most MAX_TERM_DEPTH). */
function checkParent(
  all: TermRow[],
  hierarchical: boolean,
  parentId: string | null,
  termId: string | null,
) {
  if (!parentId) return;
  if (!hierarchical) {
    throw new TaxonomyValidationError("Only nested taxonomies have parents.", "parentId");
  }
  if (!all.some((term) => term.id === parentId)) {
    throw new TaxonomyValidationError("Choose a parent from the list.", "parentId");
  }
  if (termId && descendantIds(all, termId).has(parentId)) {
    throw new TaxonomyValidationError(
      "A term can't be placed inside itself or one of its children.",
      "parentId",
    );
  }
  const height = termId ? heightOf(all, termId) : 1;
  if (levelOf(all, parentId) + height > MAX_TERM_DEPTH) {
    throw new TaxonomyValidationError(
      `Nesting is limited to ${MAX_TERM_DEPTH} levels. Choose a higher parent.`,
      "parentId",
    );
  }
}

async function lockTaxonomy(tx: DbOrTx, siteId: string, key: string) {
  const [row] = await tx
    .select()
    .from(taxonomies)
    .where(and(eq(taxonomies.siteId, siteId), eq(taxonomies.key, key)))
    .for("update")
    .limit(1);
  if (!row) throw new NotAllowedError("Taxonomy not found.");
  return row;
}

function slugTaken(error: unknown): never {
  if (isUniqueViolation(error, "terms_taxonomy_slug_unique")) {
    throw new TaxonomyValidationError("Another term here already uses this slug.", "slug");
  }
  throw error;
}

export async function createTerm(
  db: DbOrTx,
  userId: string,
  siteId: string,
  taxonomyKey: string,
  input: TermInput,
): Promise<TermOption> {
  const role = await requireRole(db, userId, siteId);
  if (!canCreateTerm(role, taxonomyKey)) throw new NotAllowedError("Can't add terms.");
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  try {
    return await db.transaction(async (tx) => {
      // Locking the taxonomy serializes parent changes, so two writes can't build a cycle.
      const taxonomy = await lockTaxonomy(tx, siteId, taxonomyKey);
      const all = await tx
        .select({ id: terms.id, parentId: terms.parentId })
        .from(terms)
        .where(eq(terms.taxonomyId, taxonomy.id));
      checkParent(all, taxonomy.hierarchical, parsed.data.parentId, null);
      const [term] = await tx
        .insert(terms)
        .values({ siteId, taxonomyId: taxonomy.id, ...parsed.data })
        .returning({
          id: terms.id,
          name: terms.name,
          slug: terms.slug,
          parentId: terms.parentId,
        });
      await tx.insert(auditEvents).values({
        siteId,
        actorId: userId,
        action: "term.created",
        targetType: "term",
        targetId: term.id,
        metadata: { taxonomy: taxonomyKey, name: term.name, slug: term.slug },
      });
      return term;
    });
  } catch (error) {
    slugTaken(error);
  }
}

/** Published entries that have `termIds`, so a change to those terms reaches webhooks. */
async function queueLiveEntries(tx: DbOrTx, siteId: string, termIds: string[]) {
  if (termIds.length === 0) return;
  const live = await tx
    .selectDistinct({
      id: contentEntries.id,
      slug: contentEntries.slug,
      title: contentEntries.title,
      modelKey: contentModels.key,
    })
    .from(entryTerms)
    .innerJoin(contentEntries, eq(contentEntries.id, entryTerms.entryId))
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(
      and(
        eq(entryTerms.siteId, siteId),
        inArray(entryTerms.termId, termIds),
        eq(contentEntries.status, "published"),
      ),
    );
  for (const entry of live) await enqueueEntryEvent(tx, siteId, "entry.updated", entry);
}

export async function updateTerm(
  db: DbOrTx,
  userId: string,
  siteId: string,
  termId: string,
  input: TermInput,
) {
  await requirePermission(db, userId, siteId, "taxonomy.manage");
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) throw firstIssue(parsed.error);
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ term: terms, key: taxonomies.key })
        .from(terms)
        .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
        .where(and(eq(terms.siteId, siteId), eq(terms.id, termId)))
        .limit(1);
      if (!current) throw new NotAllowedError("Term not found.");
      const taxonomy = await lockTaxonomy(tx, siteId, current.key);
      const all = await tx
        .select({ id: terms.id, parentId: terms.parentId })
        .from(terms)
        .where(eq(terms.taxonomyId, taxonomy.id));
      checkParent(all, taxonomy.hierarchical, parsed.data.parentId, termId);
      await tx.update(terms).set(parsed.data).where(eq(terms.id, termId));
      await tx.insert(auditEvents).values({
        siteId,
        actorId: userId,
        action: "term.updated",
        targetType: "term",
        targetId: termId,
        metadata: { taxonomy: taxonomy.key, name: parsed.data.name, slug: parsed.data.slug },
      });
      const { name, slug, parentId } = current.term;
      const d = parsed.data;
      if (name !== d.name || slug !== d.slug || parentId !== d.parentId) {
        await queueLiveEntries(tx, siteId, [termId]);
      }
    });
  } catch (error) {
    slugTaken(error);
  }
}

/**
 * Deletes a term. Entries keep existing and just lose the term; its children
 * move up to its parent.
 */
export async function deleteTerm(db: DbOrTx, userId: string, siteId: string, termId: string) {
  await requirePermission(db, userId, siteId, "taxonomy.manage");
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ term: terms, key: taxonomies.key })
      .from(terms)
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(and(eq(terms.siteId, siteId), eq(terms.id, termId)))
      .limit(1);
    if (!current) throw new NotAllowedError("Term not found.");
    await lockTaxonomy(tx, siteId, current.key);
    await queueLiveEntries(tx, siteId, [termId]);
    await tx
      .update(terms)
      .set({ parentId: current.term.parentId })
      .where(eq(terms.parentId, termId));
    await tx.delete(terms).where(eq(terms.id, termId));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "term.deleted",
      targetType: "term",
      targetId: termId,
      metadata: { taxonomy: current.key, name: current.term.name, slug: current.term.slug },
    });
  });
}

/** Type-ahead for flat taxonomies (tags): name or slug contains `query`. */
export async function searchTerms(
  db: DbOrTx,
  userId: string,
  siteId: string,
  taxonomyKey: string,
  query: string,
  limit = 20,
): Promise<TermOption[]> {
  await requireRole(db, userId, siteId);
  const q = query
    .trim()
    .slice(0, 80)
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  return db
    .select({ id: terms.id, name: terms.name, slug: terms.slug, parentId: terms.parentId })
    .from(terms)
    .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
    .where(
      and(
        eq(taxonomies.siteId, siteId),
        eq(taxonomies.key, taxonomyKey),
        q ? or(ilike(terms.name, `%${q}%`), ilike(terms.slug, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(asc(terms.name))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/** The taxonomies that apply to an entry's content type, with its assigned terms. */
export async function getEntryTaxonomies(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
): Promise<EntryTaxonomy[]> {
  const role = await requireRole(db, userId, siteId);
  const [entry] = await db
    .select({ modelKey: contentModels.key })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
    .limit(1);
  if (!entry) return [];
  const applicable = (await db.select().from(taxonomies).where(eq(taxonomies.siteId, siteId)))
    .filter((taxonomy) => appliesTo(taxonomy, entry.modelKey))
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.key.localeCompare(b.key));
  if (applicable.length === 0) return [];

  const assigned = await db
    .select({ termId: entryTerms.termId })
    .from(entryTerms)
    .where(eq(entryTerms.entryId, entryId));
  const assignedIds = new Set(assigned.map((row) => row.termId));
  const all = await db
    .select({
      id: terms.id,
      name: terms.name,
      slug: terms.slug,
      parentId: terms.parentId,
      taxonomyId: terms.taxonomyId,
    })
    .from(terms)
    .where(
      inArray(
        terms.taxonomyId,
        applicable.map((taxonomy) => taxonomy.id),
      ),
    )
    .orderBy(asc(terms.name));

  return applicable.map((taxonomy) => {
    const own = all.filter((term) => term.taxonomyId === taxonomy.id);
    const shown = taxonomy.hierarchical ? own : own.filter((term) => assignedIds.has(term.id));
    return {
      key: taxonomy.key,
      name: taxonomy.name,
      hierarchical: taxonomy.hierarchical,
      terms: shown.map(({ id, name, slug, parentId }) => ({ id, name, slug, parentId })),
      selected: own.filter((term) => assignedIds.has(term.id)).map((term) => term.id),
      canCreate: canCreateTerm(role, taxonomy.key),
    };
  });
}

/**
 * Replaces an entry's terms in one taxonomy. Needs the right to edit the
 * entry. Doesn't touch the entry's version; queues entry.updated if it's live.
 */
export async function setEntryTerms(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
  taxonomyKey: string,
  termIds: string[],
): Promise<string[]> {
  const role = await requireRole(db, userId, siteId);
  const ids = [...new Set(termIds)];
  if (ids.length > MAX_TERMS_PER_ENTRY) {
    throw new TaxonomyValidationError(
      `An entry can have up to ${MAX_TERMS_PER_ENTRY} terms in one taxonomy.`,
      "form",
    );
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ entry: contentEntries, modelKey: contentModels.key })
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
      .for("update", { of: contentEntries })
      .limit(1);
    if (!row) throw new NotAllowedError("Entry not found.");
    if (!canEditEntry(role, userId, row.entry)) throw new NotAllowedError("Can't edit entry.");
    const taxonomy = await findTaxonomy(tx, siteId, taxonomyKey);
    if (!taxonomy || !appliesTo(taxonomy, row.modelKey)) {
      throw new TaxonomyValidationError("This taxonomy isn't used by this content type.", "form");
    }
    const valid =
      ids.length === 0
        ? []
        : await tx
            .select({ id: terms.id })
            .from(terms)
            .where(and(eq(terms.taxonomyId, taxonomy.id), inArray(terms.id, ids)));
    if (valid.length !== ids.length) {
      throw new TaxonomyValidationError("Some of those terms no longer exist. Reload.", "form");
    }

    const current = await tx
      .select({ termId: entryTerms.termId })
      .from(entryTerms)
      .innerJoin(terms, eq(terms.id, entryTerms.termId))
      .where(and(eq(entryTerms.entryId, entryId), eq(terms.taxonomyId, taxonomy.id)));
    const before = new Set(current.map((item) => item.termId));
    const removed = [...before].filter((id) => !ids.includes(id));
    const added = ids.filter((id) => !before.has(id));
    if (removed.length === 0 && added.length === 0) return ids;

    if (removed.length > 0) {
      await tx
        .delete(entryTerms)
        .where(and(eq(entryTerms.entryId, entryId), inArray(entryTerms.termId, removed)));
    }
    if (added.length > 0) {
      await tx.insert(entryTerms).values(added.map((termId) => ({ entryId, termId, siteId })));
    }
    if (row.entry.status === "published") {
      const { id, slug, title } = row.entry;
      await enqueueEntryEvent(tx, siteId, "entry.updated", {
        id,
        slug,
        title,
        modelKey: row.modelKey,
      });
    }
    return ids;
  });
}
