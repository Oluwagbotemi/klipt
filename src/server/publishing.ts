import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { recordActivity } from "@/server/activity";
import type { DbOrTx } from "@/server/db";
import { contentEntries, contentModels, redirects, sites, taxonomies } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { loadPathRules } from "@/server/path-rules";
import { getSiteRole } from "@/server/sites";
import { enqueueEntryEvent } from "@/server/webhooks";
import { can } from "@/lib/permissions";
import type { PatternChange, PublishingSettings } from "@/lib/publishing";
import {
  defaultPattern,
  entryDate,
  entryPath,
  normalizePattern,
  patternFor,
  patternsOverlap,
  termArchivePattern,
  validatePatterns,
  type PathRules,
  type PatternOwner,
  type UrlPatterns,
} from "@/lib/url-patterns";

export { loadPathRules, loadWorkflowRules } from "@/server/path-rules";
export type { PatternChange, PublishingSettings };

/*
 * Settings › Publishing: per-type URL patterns, the "require review" rule and
 * the default type for "New". Changing a pattern moves every live entry of
 * that type; each move gets a one-hop 301 redirect and an entry.slug_changed
 * webhook, all in the same transaction as the change.
 */

export class PublishingValidationError extends Error {
  constructor(
    message: string,
    readonly errors: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function requireManager(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role || !can(role, "site.update")) throw new NotAllowedError("Missing site.update.");
  return role;
}

async function archiveOwners(db: DbOrTx, siteId: string): Promise<PatternOwner[]> {
  const rows = await db
    .select({ key: taxonomies.key, name: taxonomies.name })
    .from(taxonomies)
    .where(eq(taxonomies.siteId, siteId));
  return rows.map((row) => ({
    key: `taxonomy:${row.key}`,
    label: `${row.name} pages`,
    pattern: termArchivePattern(row.key),
  }));
}

async function modelsOf(db: DbOrTx, siteId: string) {
  return db
    .select({ id: contentModels.id, key: contentModels.key, name: contentModels.name })
    .from(contentModels)
    .where(eq(contentModels.siteId, siteId))
    .orderBy(asc(contentModels.createdAt));
}

/**
 * Whether a new content type or taxonomy whose addresses look like `pattern`
 * would overlap an existing type's or term archive's. Returns the clashing
 * owner's label, or null.
 */
export async function findPathClash(
  db: DbOrTx,
  siteId: string,
  pattern: string,
): Promise<string | null> {
  const [rules, models, archives] = await Promise.all([
    loadPathRules(db, siteId),
    modelsOf(db, siteId),
    archiveOwners(db, siteId),
  ]);
  const owners = [
    ...models.map((m) => ({ label: m.name, pattern: patternFor(rules, m.key) })),
    ...archives,
  ];
  const clash = owners.find((owner) => patternsOverlap(owner.pattern, pattern));
  return clash ? `${clash.label} (${clash.pattern})` : null;
}

export async function getPublishingSettings(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<PublishingSettings> {
  await requireManager(db, userId, siteId);
  const [[site], models, taxonomyRows, counts] = await Promise.all([
    db.select().from(sites).where(eq(sites.id, siteId)).limit(1),
    modelsOf(db, siteId),
    db
      .select({ key: taxonomies.key, name: taxonomies.name })
      .from(taxonomies)
      .where(eq(taxonomies.siteId, siteId))
      .orderBy(asc(taxonomies.createdAt)),
    db
      .select({ modelId: contentEntries.modelId, n: sql<number>`count(*)::int` })
      .from(contentEntries)
      .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.status, "published")))
      .groupBy(contentEntries.modelId),
  ]);
  const rules: PathRules = { patterns: site.urlPatterns ?? {}, timeZone: site.timezone };
  const live = new Map(counts.map((row) => [row.modelId, row.n]));
  const keys = new Set(models.map((m) => m.key));
  return {
    requireReview: site.requireReview,
    defaultModelKey:
      site.defaultModelKey && keys.has(site.defaultModelKey) ? site.defaultModelKey : "post",
    timeZone: site.timezone,
    domain: site.domain,
    previewUrl: site.previewUrl,
    types: models.map((m) => ({
      key: m.key,
      name: m.name,
      pattern: patternFor(rules, m.key),
      defaultPattern: defaultPattern(m.key),
      live: live.get(m.id) ?? 0,
    })),
    archives: taxonomyRows.map((t) => ({
      key: t.key,
      name: t.name,
      pattern: termArchivePattern(t.key),
    })),
  };
}

interface Move {
  entry: typeof contentEntries.$inferSelect;
  modelKey: string;
  from: string;
  to: string;
}

/** Validates the submitted patterns and works out which live URLs would move. */
async function planPatterns(db: DbOrTx, siteId: string, input: unknown) {
  const submitted =
    input && typeof input === "object" && "patterns" in input
      ? (input as { patterns: unknown }).patterns
      : null;
  if (!submitted || typeof submitted !== "object") {
    throw new PublishingValidationError("Send a pattern for each content type.");
  }
  const [oldRules, models, archives] = await Promise.all([
    loadPathRules(db, siteId),
    modelsOf(db, siteId),
    archiveOwners(db, siteId),
  ]);

  const proposed: PatternOwner[] = models.map((m) => {
    const value = (submitted as Record<string, unknown>)[m.key];
    return {
      key: m.key,
      label: m.name,
      pattern: typeof value === "string" ? normalizePattern(value) : patternFor(oldRules, m.key),
    };
  });
  const errors = validatePatterns(proposed, archives);
  if (Object.keys(errors).length > 0) {
    throw new PublishingValidationError("Fix the highlighted patterns.", errors);
  }

  // Only patterns that differ from the default are stored.
  const patterns: UrlPatterns = {};
  for (const owner of proposed) {
    if (owner.pattern !== defaultPattern(owner.key)) patterns[owner.key] = owner.pattern;
  }
  const newRules: PathRules = { patterns, timeZone: oldRules.timeZone };

  const changedModels = models.filter(
    (m) => patternFor(oldRules, m.key) !== patternFor(newRules, m.key),
  );
  const moves: Move[] = [];
  if (changedModels.length > 0) {
    const keyOf = new Map(changedModels.map((m) => [m.id, m.key]));
    const live = await db
      .select()
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.siteId, siteId),
          eq(contentEntries.status, "published"),
          inArray(
            contentEntries.modelId,
            changedModels.map((m) => m.id),
          ),
        ),
      )
      .orderBy(asc(contentEntries.slug));
    for (const entry of live) {
      const modelKey = keyOf.get(entry.modelId)!;
      const date = entryDate(entry);
      const from = entryPath(oldRules, modelKey, entry.slug, date);
      const to = entryPath(newRules, modelKey, entry.slug, date);
      if (from !== to) moves.push({ entry, modelKey, from, to });
    }
  }

  const changes: PatternChange[] = changedModels.map((m) => {
    const mine = moves.filter((move) => move.modelKey === m.key);
    return {
      key: m.key,
      name: m.name,
      from: patternFor(oldRules, m.key),
      to: patternFor(newRules, m.key),
      moving: mine.length,
      example: mine[0] ? { from: mine[0].from, to: mine[0].to } : null,
    };
  });
  return { patterns, changes, moves };
}

/** What saving these patterns would change, without changing anything. */
export async function previewUrlPatterns(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: unknown,
): Promise<PatternChange[]> {
  await requireManager(db, userId, siteId);
  return (await planPatterns(db, siteId, input)).changes;
}

/**
 * Saves the patterns. Every live entry whose address changes gets a 301 from
 * its old path; redirects that pointed at an old path are re-pointed (no
 * chains), and redirects away from a path that is now live are removed (no
 * loops, no hidden pages).
 */
export async function saveUrlPatterns(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: unknown,
): Promise<{ changes: PatternChange[]; redirects: number }> {
  return db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    // One pattern change at a time per site.
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for("update");
    const { patterns, changes, moves } = await planPatterns(tx, siteId, input);
    if (changes.length === 0) return { changes, redirects: 0 };

    await tx
      .update(sites)
      .set({ urlPatterns: patterns, updatedAt: new Date() })
      .where(eq(sites.id, siteId));

    if (moves.length > 0) {
      for (const move of moves) {
        await tx
          .update(redirects)
          .set({ toPath: move.to, updatedAt: new Date() })
          .where(and(eq(redirects.siteId, siteId), eq(redirects.toPath, move.from)));
      }
      await tx
        .insert(redirects)
        .values(
          moves.map((move) => ({
            siteId,
            fromPath: move.from,
            toPath: move.to,
            statusCode: 301,
            entryId: move.entry.id,
            createdById: userId,
          })),
        )
        .onConflictDoUpdate({
          target: [redirects.siteId, redirects.fromPath],
          set: {
            toPath: sql`excluded.to_path`,
            statusCode: 301,
            entryId: sql`excluded.entry_id`,
            createdById: userId,
            updatedAt: new Date(),
          },
        });
      // A path that is live now must not redirect anywhere (e.g. two types swapping).
      await tx.delete(redirects).where(
        and(
          eq(redirects.siteId, siteId),
          inArray(
            redirects.fromPath,
            moves.map((move) => move.to),
          ),
        ),
      );
      for (const move of moves) {
        await enqueueEntryEvent(
          tx,
          siteId,
          "entry.slug_changed",
          { ...move.entry, modelKey: move.modelKey },
          { previousPath: move.from, redirectCreated: true },
        );
      }
    }

    await recordActivity(tx, {
      siteId,
      actorId: userId,
      action: "publishing.url_patterns_changed",
      targetType: "site",
      targetId: siteId,
      metadata: {
        changes: changes.map(({ name, from, to, moving }) => ({ name, from, to, moving })),
        moved: moves.length,
      },
    });
    return { changes, redirects: moves.length };
  });
}

/** Require review and the default type for "New". */
export async function savePublishingRules(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: { requireReview: boolean; defaultModelKey: string },
) {
  await db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    const [model] = await tx
      .select({ key: contentModels.key, name: contentModels.name })
      .from(contentModels)
      .where(and(eq(contentModels.siteId, siteId), eq(contentModels.key, input.defaultModelKey)))
      .limit(1);
    if (!model) {
      throw new PublishingValidationError("Choose one of this site's content types.", {
        defaultModelKey: "Choose one of this site's content types.",
      });
    }
    const [before] = await tx
      .select({ requireReview: sites.requireReview, defaultModelKey: sites.defaultModelKey })
      .from(sites)
      .where(eq(sites.id, siteId))
      .for("update");
    await tx
      .update(sites)
      .set({
        requireReview: input.requireReview,
        defaultModelKey: model.key === "post" ? null : model.key,
        updatedAt: new Date(),
      })
      .where(eq(sites.id, siteId));
    if (before.requireReview !== input.requireReview) {
      await recordActivity(tx, {
        siteId,
        actorId: userId,
        action: input.requireReview ? "publishing.review_required" : "publishing.review_optional",
        targetType: "site",
        targetId: siteId,
      });
    }
    if ((before.defaultModelKey ?? "post") !== model.key) {
      await recordActivity(tx, {
        siteId,
        actorId: userId,
        action: "publishing.default_type_changed",
        targetType: "site",
        targetId: siteId,
        metadata: { name: model.name, key: model.key },
      });
    }
  });
}

/** The content type "New" offers first; posts unless Settings › Publishing says otherwise. */
export async function getDefaultModelKey(db: DbOrTx, siteId: string): Promise<string> {
  const [row] = await db
    .select({ key: contentModels.key })
    .from(sites)
    .innerJoin(
      contentModels,
      and(eq(contentModels.siteId, sites.id), eq(contentModels.key, sites.defaultModelKey)),
    )
    .where(eq(sites.id, siteId))
    .limit(1);
  return row?.key ?? "post";
}
