import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import {
  apiKeys,
  auditEvents,
  contentEntries,
  contentModels,
  mediaAssets,
  menus,
  siteMembers,
  sites,
  taxonomies,
  terms,
  users,
  webhooks,
} from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import {
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_RETENTION_DAYS,
  KIND_PREFIXES,
  describeActivity,
  kindOf,
  visibleKinds,
  type ActivityFeed,
  type ActivityItem,
  type ActivityParams,
} from "@/lib/activity";
import { siteHref } from "@/lib/navigation";

/*
 * The site activity log (Team › Activity). Rows live in audit_events and are
 * written inside the transaction of the change they describe, either through
 * recordActivity() or a module's own audit helper; metadata keeps display
 * snapshots (title, name, email…) so the feed reads correctly after targets
 * are renamed or deleted.
 */

export interface ActivityInput {
  siteId: string;
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordActivity(db: DbOrTx, input: ActivityInput) {
  await db.insert(auditEvents).values({
    siteId: input.siteId,
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}

/** Autosave runs every second; one "edited" row per person and entry per window is enough. */
export const EDIT_ACTIVITY_WINDOW_MS = 15 * 60 * 1000;

/** Records "edited" unless this person already created or edited the entry recently. */
export async function recordEntryEdit(
  db: DbOrTx,
  siteId: string,
  actorId: string,
  entry: { id: string; title: string },
  now = new Date(),
) {
  const [recent] = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.siteId, siteId),
        eq(auditEvents.targetId, entry.id),
        eq(auditEvents.actorId, actorId),
        inArray(auditEvents.action, ["content.updated", "content.created"]),
        gte(auditEvents.createdAt, new Date(now.getTime() - EDIT_ACTIVITY_WINDOW_MS)),
      ),
    )
    .limit(1);
  if (recent) return false;
  await recordActivity(db, {
    siteId,
    actorId,
    action: "content.updated",
    targetType: "content_entry",
    targetId: entry.id,
    metadata: { title: entry.title },
  });
  return true;
}

/** Keeps the actor's name on their activity before their account is deleted. */
export async function keepActorName(db: DbOrTx, userId: string) {
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return;
  await db.update(auditEvents).set({ actorName: user.name }).where(eq(auditEvents.actorId, userId));
}

/** Deletes activity older than the retention period (daily job). */
export async function pruneActivity(db: DbOrTx, now = new Date()) {
  const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const removed = await db
    .delete(auditEvents)
    .where(lt(auditEvents.createdAt, cutoff))
    .returning({ id: auditEvents.id });
  return removed.length;
}

function prefixesFor(kinds: string[]) {
  return kinds.flatMap((kind) => KIND_PREFIXES[kind as keyof typeof KIND_PREFIXES] ?? []);
}

const TAXONOMY_TABS: Record<string, string | null> = { category: null, tag: "tags" };

function taxonomyHref(siteId: string, key: unknown) {
  if (typeof key !== "string" || !key) return siteHref(siteId, "taxonomy");
  return key in TAXONOMY_TABS
    ? siteHref(siteId, "taxonomy", TAXONOMY_TABS[key])
    : `${siteHref(siteId, "taxonomy", "custom")}/${key}`;
}

/** Ids per target type that still exist in the site, for linking. */
async function existingTargets(
  db: DbOrTx,
  siteId: string,
  rows: { targetType: string | null; targetId: string | null }[],
) {
  const ids = (type: string) => [
    ...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!)),
  ];
  const lookup = async <T extends { id: string }>(
    type: string,
    query: (ids: string[]) => Promise<T[]>,
  ) => {
    const wanted = ids(type);
    return new Map((wanted.length ? await query(wanted) : []).map((row) => [row.id, row]));
  };
  const [entries, media, models, menuRows, taxonomyRows, termRows, hooks, keys] = await Promise.all(
    [
      lookup("content_entry", (wanted) =>
        db
          .select({ id: contentEntries.id })
          .from(contentEntries)
          .where(and(eq(contentEntries.siteId, siteId), inArray(contentEntries.id, wanted))),
      ),
      lookup("media_asset", (wanted) =>
        db
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(and(eq(mediaAssets.siteId, siteId), inArray(mediaAssets.id, wanted))),
      ),
      lookup("content_model", (wanted) =>
        db
          .select({ id: contentModels.id })
          .from(contentModels)
          .where(and(eq(contentModels.siteId, siteId), inArray(contentModels.id, wanted))),
      ),
      lookup("menu", (wanted) =>
        db
          .select({ id: menus.id, key: menus.key })
          .from(menus)
          .where(and(eq(menus.siteId, siteId), inArray(menus.id, wanted))),
      ),
      lookup("taxonomy", (wanted) =>
        db
          .select({ id: taxonomies.id, key: taxonomies.key })
          .from(taxonomies)
          .where(and(eq(taxonomies.siteId, siteId), inArray(taxonomies.id, wanted))),
      ),
      lookup("term", (wanted) =>
        db
          .select({ id: terms.id, key: taxonomies.key })
          .from(terms)
          .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
          .where(and(eq(taxonomies.siteId, siteId), inArray(terms.id, wanted))),
      ),
      lookup("webhook", (wanted) =>
        db
          .select({ id: webhooks.id })
          .from(webhooks)
          .where(and(eq(webhooks.siteId, siteId), inArray(webhooks.id, wanted))),
      ),
      lookup("api_key", (wanted) =>
        db
          .select({ id: apiKeys.id })
          .from(apiKeys)
          .where(and(eq(apiKeys.siteId, siteId), inArray(apiKeys.id, wanted))),
      ),
    ],
  );
  return { entries, media, models, menuRows, taxonomyRows, termRows, hooks, keys };
}

type Targets = Awaited<ReturnType<typeof existingTargets>>;

/** Where an event's target can be seen now, or null if it's gone. */
function hrefFor(
  siteId: string,
  row: { action: string; targetType: string | null; targetId: string | null },
  targets: Targets,
): string | null {
  const id = row.targetId ?? "";
  switch (row.targetType) {
    case "content_entry":
      return targets.entries.has(id) ? `${siteHref(siteId, "content")}/${id}` : null;
    case "media_asset":
      return targets.media.has(id) ? siteHref(siteId, "media") : null;
    case "content_model":
      return targets.models.has(id) ? `${siteHref(siteId, "models")}/${id}` : null;
    case "menu": {
      const menu = targets.menuRows.get(id);
      return menu ? `${siteHref(siteId, "navigation")}/${menu.key}` : null;
    }
    case "taxonomy": {
      const taxonomy = targets.taxonomyRows.get(id);
      return taxonomy ? taxonomyHref(siteId, taxonomy.key) : null;
    }
    case "term": {
      const term = targets.termRows.get(id);
      return term ? taxonomyHref(siteId, term.key) : null;
    }
    case "webhook":
      return targets.hooks.has(id)
        ? `${siteHref(siteId, "settings", "integrations")}/webhooks/${id}`
        : null;
    case "api_key":
      return targets.keys.has(id) ? siteHref(siteId, "settings", "integrations") : null;
    case "redirect":
      return siteHref(siteId, "seo", "redirects");
    case "member":
    case "invitation":
      return siteHref(siteId, "team");
    case "ownership_transfer":
      return siteHref(siteId, "settings", "ownership");
    case "site":
      if (row.action.startsWith("seo.indexing")) return siteHref(siteId, "seo", "indexing");
      if (row.action === "seo.defaults_changed") return siteHref(siteId, "settings", "seo");
      if (row.action === "site.domain_changed") return siteHref(siteId, "settings", "domains");
      if (row.action.startsWith("previews.")) return siteHref(siteId, "settings", "integrations");
      return siteHref(siteId, "settings");
    default:
      return null;
  }
}

function dayIn(timezone: string) {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" });
  }
  return (date: Date) => format.format(date);
}

/**
 * The feed a member may see, newest first. Throws NotAllowedError for members
 * whose role can't see activity (see visibleKinds).
 */
export async function listActivity(
  db: DbOrTx,
  userId: string,
  siteId: string,
  params: ActivityParams,
  options: { pageSize?: number } = {},
): Promise<ActivityFeed> {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member of this site.");
  const kinds = visibleKinds(role);
  if (kinds.length === 0) throw new NotAllowedError("Your role can't see site activity.");

  const [site] = await db
    .select({ timezone: sites.timezone })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  const timezone = site?.timezone || "UTC";

  const shown = params.kind ? kinds.filter((kind) => kind === params.kind) : kinds;
  const pageSize = options.pageSize ?? ACTIVITY_PAGE_SIZE;
  const people = await db
    .select({ id: users.id, name: users.name })
    .from(siteMembers)
    .innerJoin(users, eq(users.id, siteMembers.userId))
    .where(eq(siteMembers.siteId, siteId))
    .orderBy(asc(sql`lower(${users.name})`));
  if (shown.length === 0) {
    return { items: [], page: 1, hasMore: false, kinds, people, timezone };
  }

  const conditions: (SQL | undefined)[] = [
    eq(auditEvents.siteId, siteId),
    inArray(sql<string>`split_part(${auditEvents.action}, '.', 1)`, prefixesFor(shown)),
    params.person ? eq(auditEvents.actorId, params.person) : undefined,
    params.from
      ? sql`${auditEvents.createdAt} >= (${params.from}::date)::timestamp at time zone ${timezone}`
      : undefined,
    params.to
      ? sql`${auditEvents.createdAt} < ((${params.to}::date + 1)::timestamp at time zone ${timezone})`
      : undefined,
  ];

  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorId: auditEvents.actorId,
      actorSnapshot: auditEvents.actorName,
      actorName: users.name,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(pageSize + 1)
    .offset((params.page - 1) * pageSize);

  const page = rows.slice(0, pageSize);
  const targets = await existingTargets(db, siteId, page);
  const toDay = dayIn(timezone);
  const items: ActivityItem[] = page.map((row) => {
    const sentence = describeActivity(row.action, { ...row.metadata, actorId: row.actorId });
    return {
      id: row.id,
      action: row.action,
      kind: kindOf(row.action) ?? "content",
      actorId: row.actorId,
      actorName: row.actorName ?? row.actorSnapshot ?? "A former member",
      actorActive: row.actorName !== null,
      ...sentence,
      href: hrefFor(siteId, row, targets),
      createdAt: row.createdAt.toISOString(),
      day: toDay(row.createdAt),
    };
  });
  return { items, page: params.page, hasMore: rows.length > pageSize, kinds, people, timezone };
}
