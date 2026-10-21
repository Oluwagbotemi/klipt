import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import {
  auditEvents,
  contentEntries,
  contentModels,
  entryTerms,
  taxonomies,
  terms,
  users,
} from "@/server/db/schema";
import { publishDueEntries } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import { enqueueEntryEvent } from "@/server/webhooks";
import {
  CONTENT_STATUSES,
  entryActions,
  PAGE_SIZE,
  slugify,
  type BulkAction,
  type ContentListParams,
  type ContentStatus,
  type ContentType,
  type EntryList,
  type EntrySummary,
} from "@/lib/content";
import { can } from "@/lib/permissions";

/*
 * Content queries. Every function takes the acting user's id, checks their
 * membership of the site, and only touches entries of that site. Call them
 * through the data layer (src/lib/data/content.ts).
 */

export { NotAllowedError };

const entryFields = {
  id: contentEntries.id,
  title: contentEntries.title,
  slug: contentEntries.slug,
  status: contentEntries.status,
  modelKey: contentModels.key,
  modelName: contentModels.name,
  isSystemModel: contentModels.isSystem,
  authorId: contentEntries.authorId,
  authorName: users.name,
  createdAt: contentEntries.createdAt,
  updatedAt: contentEntries.updatedAt,
  publishedAt: contentEntries.publishedAt,
  scheduledAt: contentEntries.scheduledAt,
};

/** Base query for entry summaries (entry + model + author). */
function selectEntries(db: DbOrTx) {
  return db
    .select(entryFields)
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .leftJoin(users, eq(users.id, contentEntries.authorId));
}

type EntryRow = Awaited<ReturnType<typeof selectEntries>>[number];

function toSummary(row: EntryRow): EntrySummary {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
  };
}

/** Entries that have the term "taxonomyKey:slug" (assigned directly). */
function hasTerm(db: DbOrTx, siteId: string, term: string) {
  const [key, slug] = term.split(":");
  return exists(
    db
      .select({ one: sql`1` })
      .from(entryTerms)
      .innerJoin(terms, eq(terms.id, entryTerms.termId))
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(
        and(
          eq(entryTerms.entryId, contentEntries.id),
          eq(taxonomies.siteId, siteId),
          eq(taxonomies.key, key),
          eq(terms.slug, slug),
        ),
      ),
  );
}

function typeCondition(type: ContentType): SQL | undefined {
  switch (type) {
    case "page":
    case "post":
      return and(eq(contentModels.key, type), eq(contentModels.isSystem, true));
    case "collection":
      return eq(contentModels.isSystem, false);
    case "all":
      return undefined;
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  return role;
}

export async function listEntries(
  db: DbOrTx,
  userId: string,
  siteId: string,
  type: ContentType,
  params: ContentListParams,
): Promise<EntryList> {
  await requireRole(db, userId, siteId);
  await publishDueEntries(db, siteId);

  const needle = params.q ? `%${escapeLike(params.q)}%` : null;
  const scope = and(
    eq(contentEntries.siteId, siteId),
    typeCondition(type),
    needle
      ? or(ilike(contentEntries.title, needle), ilike(contentEntries.slug, needle))
      : undefined,
    params.term ? hasTerm(db, siteId, params.term) : undefined,
  );

  const countRows = await db
    .select({ status: contentEntries.status, n: count() })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(scope)
    .groupBy(contentEntries.status);
  const counts = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, 0])) as Record<
    ContentStatus,
    number
  >;
  for (const row of countRows) counts[row.status] = Number(row.n);

  const total =
    params.status === "active"
      ? CONTENT_STATUSES.filter((s) => s !== "archived").reduce((sum, s) => sum + counts[s], 0)
      : counts[params.status];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pageCount);

  const order = {
    updated_desc: [desc(contentEntries.updatedAt)],
    updated_asc: [asc(contentEntries.updatedAt)],
    title_asc: [asc(sql`lower(${contentEntries.title})`)],
    title_desc: [desc(sql`lower(${contentEntries.title})`)],
  }[params.sort];

  const rows = await selectEntries(db)
    .where(
      and(
        scope,
        params.status === "active"
          ? ne(contentEntries.status, "archived")
          : eq(contentEntries.status, params.status),
      ),
    )
    .orderBy(...order, asc(contentEntries.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return { items: rows.map(toSummary), total, page, pageCount, counts };
}

export async function getEntry(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
): Promise<EntrySummary | null> {
  await requireRole(db, userId, siteId);
  await publishDueEntries(db, siteId);
  const [row] = await selectEntries(db)
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
    .limit(1);
  return row ? toSummary(row) : null;
}

/** Picks `base`, or `base-2`, `base-3`… so the slug is unique within the site and model. */
async function uniqueSlug(db: DbOrTx, siteId: string, modelId: string, base: string) {
  const taken = await db
    .select({ slug: contentEntries.slug })
    .from(contentEntries)
    .where(
      and(
        eq(contentEntries.siteId, siteId),
        eq(contentEntries.modelId, modelId),
        or(eq(contentEntries.slug, base), ilike(contentEntries.slug, `${escapeLike(base)}-%`)),
      ),
    );
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Creates a draft entry of a built-in or custom model. Returns its id. */
export async function createEntry(
  db: DbOrTx,
  userId: string,
  siteId: string,
  modelKey: string,
  title?: string,
): Promise<{ id: string }> {
  const role = await requireRole(db, userId, siteId);
  if (!can(role, "content.create")) throw new NotAllowedError("Can't create content.");

  const [model] = await db
    .select({ id: contentModels.id, name: contentModels.name })
    .from(contentModels)
    .where(and(eq(contentModels.siteId, siteId), eq(contentModels.key, modelKey)))
    .limit(1);
  if (!model) throw new NotAllowedError("Unknown content type.");

  const entryTitle = title?.trim() || `Untitled ${model.name.toLowerCase()}`;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const slug = await uniqueSlug(tx, siteId, model.id, slugify(entryTitle));
        const [entry] = await tx
          .insert(contentEntries)
          .values({ siteId, modelId: model.id, title: entryTitle, slug, authorId: userId })
          .returning({ id: contentEntries.id });
        await tx.insert(auditEvents).values({
          siteId,
          actorId: userId,
          action: "content.created",
          targetType: "content_entry",
          targetId: entry.id,
          metadata: { model: modelKey, title: entryTitle, slug },
        });
        return entry;
      });
    } catch (error) {
      // Two creates can race for the same slug; try again with the next free one.
      if (attempt < 3 && isUniqueViolation(error, "content_entries_site_model_slug_unique"))
        continue;
      throw error;
    }
  }
}

/**
 * Applies a bulk action to the given entries of a site. Entries the member
 * may not act on (or that don't apply, e.g. restoring a draft) are skipped.
 */
export async function applyBulkAction(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryIds: string[],
  action: BulkAction,
): Promise<{ applied: number; skipped: number }> {
  const role = await requireRole(db, userId, siteId);
  const ids = [...new Set(entryIds)].slice(0, 500);
  if (ids.length === 0) return { applied: 0, skipped: 0 };

  return db.transaction(async (tx) => {
    const entries = await tx
      .select({
        id: contentEntries.id,
        title: contentEntries.title,
        status: contentEntries.status,
        authorId: contentEntries.authorId,
        publishedAt: contentEntries.publishedAt,
        slug: contentEntries.slug,
        modelKey: contentModels.key,
      })
      .from(contentEntries)
      .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
      .where(and(eq(contentEntries.siteId, siteId), inArray(contentEntries.id, ids)));

    const allowed = entries.filter((entry) => entryActions(role, userId, entry)[action]);
    const allowedIds = allowed.map((entry) => entry.id);

    if (allowedIds.length > 0) {
      const where = and(eq(contentEntries.siteId, siteId), inArray(contentEntries.id, allowedIds));
      if (action === "archive") {
        await tx.update(contentEntries).set({ status: "archived", scheduledAt: null }).where(where);
      } else if (action === "restore") {
        await tx.update(contentEntries).set({ status: "draft" }).where(where);
      } else {
        await tx.delete(contentEntries).where(where);
      }
      await tx.insert(auditEvents).values(
        allowed.map((entry) => ({
          siteId,
          actorId: userId,
          action: `content.${action === "delete" ? "deleted" : `${action}d`}`,
          targetType: "content_entry",
          targetId: entry.id,
          metadata: { title: entry.title, previousStatus: entry.status },
        })),
      );
      if (action === "archive") {
        // Archiving live content takes it off the website.
        for (const entry of allowed.filter((item) => item.status === "published")) {
          await enqueueEntryEvent(tx, siteId, "entry.unpublished", entry);
        }
      }
    }

    return { applied: allowedIds.length, skipped: ids.length - allowedIds.length };
  });
}
