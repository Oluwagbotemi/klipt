import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { auditEvents, contentEntries, contentModels, menuItems, menus } from "@/server/db/schema";
import { publishDueEntries } from "@/server/editor";
import { NotAllowedError } from "@/server/errors";
import { loadPathRules } from "@/server/path-rules";
import { getSiteRole } from "@/server/sites";
import { enqueueSiteEvent } from "@/server/webhooks";
import type { LinkTarget } from "@/lib/models";
import {
  createMenuSchema,
  isSystemMenu,
  MAX_CUSTOM_MENUS,
  menuItemsSchema,
  SYSTEM_MENUS,
  type DeliveryMenuItem,
  type MenuDetail,
  type MenuItemView,
  type MenuSummary,
} from "@/lib/menus";
import { can } from "@/lib/permissions";
import { entryDate, entryPath, type PathRules } from "@/lib/url-patterns";

/*
 * Navigation menus. Header and footer exist for every site (created lazily
 * the first time menus are listed); members with navigation.manage can add
 * custom menus. A save replaces all of a menu's items at once and is refused
 * if the menu changed since the editor loaded it (optimistic locking).
 *
 * Entry items store the entry id, so links follow URL changes; deleting the
 * entry nulls the id. The content API (getDeliveryMenu) only includes items
 * whose entry is published, and leaves out a hidden item's children too.
 */

export class MenuConflictError extends Error {
  constructor() {
    super("Someone else saved this menu since you opened it.");
  }
}

export class MenuValidationError extends Error {
  constructor(
    message: string,
    /** Index of the item that's wrong, when it's about one item. */
    readonly index?: number,
  ) {
    super(message);
  }
}

export class MenuKeyTakenError extends Error {
  constructor() {
    super("Another menu already uses that key.");
  }
}

export class MenuLimitError extends Error {
  constructor() {
    super(`A site can have up to ${MAX_CUSTOM_MENUS} custom menus.`);
  }
}

async function requireRole(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role) throw new NotAllowedError("Not a member.");
  return role;
}

async function requireManager(db: DbOrTx, userId: string, siteId: string) {
  const role = await requireRole(db, userId, siteId);
  if (!can(role, "navigation.manage")) throw new NotAllowedError("Can't edit navigation.");
  return role;
}

async function audit(
  db: DbOrTx,
  siteId: string,
  userId: string,
  action: string,
  menuId: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(auditEvents).values({
    siteId,
    actorId: userId,
    action,
    targetType: "menu",
    targetId: menuId,
    metadata,
  });
}

/** Creates the header and footer menus if the site doesn't have them yet. */
export async function ensureSystemMenus(db: DbOrTx, siteId: string) {
  await db
    .insert(menus)
    .values(SYSTEM_MENUS.map((menu) => ({ siteId, key: menu.key, name: menu.name })))
    .onConflictDoNothing();
}

/** Entry items that won't appear on the site: entry deleted, or not live. */
const hiddenEntryItem = sql<boolean>`${menuItems.kind} = 'entry' and (${menuItems.entryId} is null or ${contentEntries.status} is distinct from 'published')`;

export async function listMenus(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<MenuSummary[]> {
  await requireRole(db, userId, siteId);
  await ensureSystemMenus(db, siteId);
  const rows = await db
    .select({
      id: menus.id,
      key: menus.key,
      name: menus.name,
      updatedAt: menus.updatedAt,
      itemCount: count(menuItems.id),
      warningCount: sql<number>`count(*) filter (where ${hiddenEntryItem})`.mapWith(Number),
    })
    .from(menus)
    .leftJoin(menuItems, eq(menuItems.menuId, menus.id))
    .leftJoin(contentEntries, eq(contentEntries.id, menuItems.entryId))
    .where(eq(menus.siteId, siteId))
    .groupBy(menus.id)
    .orderBy(asc(menus.createdAt), asc(menus.key));
  const systemOrder = (key: string) => {
    const index = SYSTEM_MENUS.findIndex((menu) => menu.key === key);
    return index === -1 ? SYSTEM_MENUS.length : index;
  };
  return rows
    .map((row) => ({
      ...row,
      isSystem: isSystemMenu(row.key),
      updatedAt: row.updatedAt.toISOString(),
    }))
    .sort((a, b) => systemOrder(a.key) - systemOrder(b.key));
}

async function loadItems(db: DbOrTx, menuId: string, rules: PathRules): Promise<MenuItemView[]> {
  const rows = await db
    .select({
      item: menuItems,
      title: contentEntries.title,
      slug: contentEntries.slug,
      status: contentEntries.status,
      modelKey: contentModels.key,
      modelName: contentModels.name,
      publishedAt: contentEntries.publishedAt,
      scheduledAt: contentEntries.scheduledAt,
    })
    .from(menuItems)
    .leftJoin(contentEntries, eq(contentEntries.id, menuItems.entryId))
    .leftJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(eq(menuItems.menuId, menuId))
    .orderBy(asc(menuItems.position));
  const depthOf = new Map<string, number>();
  return rows.map(({ item, title, slug, status, modelKey, modelName, ...dates }) => {
    const depth = item.parentId ? (depthOf.get(item.parentId) ?? 0) + 1 : 0;
    depthOf.set(item.id, depth);
    const target =
      item.kind === "entry" && title !== null && slug !== null && modelKey !== null
        ? {
            title,
            status: status ?? "draft",
            modelName: modelName ?? "",
            path: entryPath(rules, modelKey, slug, entryDate(dates)),
          }
        : null;
    return {
      id: item.id,
      label: item.label,
      kind: item.kind,
      entryId: item.entryId,
      url: item.url,
      openInNewTab: item.openInNewTab,
      depth,
      target,
      warning:
        item.kind !== "entry"
          ? null
          : !target
            ? "deleted"
            : target.status !== "published"
              ? "unpublished"
              : null,
    };
  });
}

export async function getMenu(
  db: DbOrTx,
  userId: string,
  siteId: string,
  key: string,
): Promise<MenuDetail | null> {
  await requireRole(db, userId, siteId);
  if (isSystemMenu(key)) await ensureSystemMenus(db, siteId);
  const [menu] = await db
    .select()
    .from(menus)
    .where(and(eq(menus.siteId, siteId), eq(menus.key, key)))
    .limit(1);
  if (!menu) return null;
  return {
    id: menu.id,
    key: menu.key,
    name: menu.name,
    isSystem: isSystemMenu(menu.key),
    updatedAt: menu.updatedAt.toISOString(),
    items: await loadItems(db, menu.id, await loadPathRules(db, siteId)),
  };
}

export async function createMenu(
  db: DbOrTx,
  userId: string,
  siteId: string,
  input: unknown,
): Promise<{ key: string }> {
  const values = createMenuSchema.parse(input);
  return db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    await ensureSystemMenus(tx, siteId);
    const existing = await tx
      .select({ key: menus.key })
      .from(menus)
      .where(eq(menus.siteId, siteId))
      .for("update");
    if (existing.some((menu) => menu.key === values.key)) throw new MenuKeyTakenError();
    if (existing.filter((menu) => !isSystemMenu(menu.key)).length >= MAX_CUSTOM_MENUS) {
      throw new MenuLimitError();
    }
    const [menu] = await tx
      .insert(menus)
      .values({ siteId, key: values.key, name: values.name })
      .returning({ id: menus.id });
    await audit(tx, siteId, userId, "menu.created", menu.id, values);
    return { key: values.key };
  });
}

/** Deletes a custom menu. Header and footer can be emptied but not deleted. */
export async function deleteMenu(db: DbOrTx, userId: string, siteId: string, key: string) {
  if (isSystemMenu(key)) throw new NotAllowedError("Header and footer menus can't be deleted.");
  await db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    const [menu] = await tx
      .delete(menus)
      .where(and(eq(menus.siteId, siteId), eq(menus.key, key)))
      .returning({ id: menus.id, name: menus.name });
    if (!menu) throw new NotAllowedError("Menu not found.");
    await audit(tx, siteId, userId, "menu.deleted", menu.id, { key, name: menu.name });
  });
}

/**
 * Replaces a menu's items with `items` (a flat list in display order, see
 * menuItemInputSchema). Fires "menu.updated" for subscribed webhooks.
 */
export async function saveMenu(
  db: DbOrTx,
  userId: string,
  siteId: string,
  key: string,
  input: { items: unknown; expectedUpdatedAt: string },
): Promise<MenuDetail> {
  const parsed = menuItemsSchema.safeParse(input.items);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = typeof issue.path[0] === "number" ? issue.path[0] : undefined;
    throw new MenuValidationError(issue.message, index);
  }
  const items = parsed.data;

  await db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    const [menu] = await tx
      .select()
      .from(menus)
      .where(and(eq(menus.siteId, siteId), eq(menus.key, key)))
      .for("update");
    if (!menu) throw new NotAllowedError("Menu not found.");
    if (menu.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new MenuConflictError();

    const entryIds = [
      ...new Set(
        items.flatMap((item) => (item.kind === "entry" && item.entryId ? [item.entryId] : [])),
      ),
    ];
    const found = entryIds.length
      ? await tx
          .select({ id: contentEntries.id })
          .from(contentEntries)
          .where(and(eq(contentEntries.siteId, siteId), inArray(contentEntries.id, entryIds)))
      : [];
    const known = new Set(found.map((row) => row.id));
    items.forEach((item, index) => {
      if (item.kind === "entry" && item.entryId && !known.has(item.entryId)) {
        throw new MenuValidationError(
          `"${item.label}" links to an entry that no longer exists.`,
          index,
        );
      }
    });

    await tx.delete(menuItems).where(eq(menuItems.menuId, menu.id));
    const lastAtDepth: string[] = [];
    const rows = items.map((item, position) => {
      const id = randomUUID();
      lastAtDepth[item.depth] = id;
      lastAtDepth.length = item.depth + 1;
      return {
        id,
        menuId: menu.id,
        siteId,
        parentId: item.depth > 0 ? lastAtDepth[item.depth - 1] : null,
        position,
        label: item.label,
        kind: item.kind,
        entryId: item.kind === "entry" ? (item.entryId ?? null) : null,
        url: item.kind === "url" ? (item.url ?? "").trim() : null,
        openInNewTab: item.openInNewTab,
      };
    });
    if (rows.length) await tx.insert(menuItems).values(rows);
    await tx.update(menus).set({ updatedAt: new Date() }).where(eq(menus.id, menu.id));
    await enqueueSiteEvent(tx, siteId, "menu.updated", {
      menu: { key: menu.key, name: menu.name },
    });
    await audit(tx, siteId, userId, "menu.saved", menu.id, {
      key,
      name: menu.name,
      items: rows.length,
    });
  });

  const saved = await getMenu(db, userId, siteId, key);
  if (!saved) throw new NotAllowedError("Menu not found.");
  return saved;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Entries of any content type a menu item can link to (archived ones excluded). */
export async function searchMenuTargets(
  db: DbOrTx,
  userId: string,
  siteId: string,
  q: string,
): Promise<LinkTarget[]> {
  await requireRole(db, userId, siteId);
  const needle = q.trim().slice(0, 100);
  const rows = await db
    .select({
      id: contentEntries.id,
      title: contentEntries.title,
      slug: contentEntries.slug,
      status: contentEntries.status,
      modelKey: contentModels.key,
      modelName: contentModels.name,
      publishedAt: contentEntries.publishedAt,
      scheduledAt: contentEntries.scheduledAt,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(
      and(
        eq(contentEntries.siteId, siteId),
        ne(contentEntries.status, "archived"),
        needle
          ? or(
              ilike(contentEntries.title, `%${escapeLike(needle)}%`),
              ilike(contentEntries.slug, `%${escapeLike(needle)}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(contentEntries.updatedAt))
    .limit(20);
  const rules = await loadPathRules(db, siteId);
  return rows.map(({ slug, modelKey, publishedAt, scheduledAt, ...row }) => ({
    ...row,
    path: entryPath(rules, modelKey, slug, entryDate({ publishedAt, scheduledAt })),
  }));
}

// ---------------------------------------------------------------------------
// Delivery (content API): scoped by the API key's site, published links only
// ---------------------------------------------------------------------------

export async function listDeliveryMenus(db: DbOrTx, siteId: string) {
  await ensureSystemMenus(db, siteId);
  const rows = await db
    .select({ key: menus.key, name: menus.name, updatedAt: menus.updatedAt })
    .from(menus)
    .where(eq(menus.siteId, siteId))
    .orderBy(asc(menus.key));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export async function getDeliveryMenu(db: DbOrTx, siteId: string, key: string) {
  await publishDueEntries(db, siteId);
  if (isSystemMenu(key)) await ensureSystemMenus(db, siteId);
  const [menu] = await db
    .select()
    .from(menus)
    .where(and(eq(menus.siteId, siteId), eq(menus.key, key)))
    .limit(1);
  if (!menu) return null;
  const rows = await db
    .select({
      item: menuItems,
      slug: contentEntries.slug,
      status: contentEntries.status,
      modelKey: contentModels.key,
      publishedAt: contentEntries.publishedAt,
    })
    .from(menuItems)
    .leftJoin(contentEntries, eq(contentEntries.id, menuItems.entryId))
    .leftJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .where(eq(menuItems.menuId, menu.id))
    .orderBy(asc(menuItems.position));

  const items: DeliveryMenuItem[] = [];
  const nodes = new Map<string, DeliveryMenuItem>();
  const rules = await loadPathRules(db, siteId);
  for (const { item, slug, status, modelKey, publishedAt } of rows) {
    let url: string | null = null;
    if (item.kind === "url") url = item.url;
    else if (status === "published" && slug !== null && modelKey !== null) {
      url = entryPath(rules, modelKey, slug, publishedAt);
    }
    if (!url) continue;
    const node: DeliveryMenuItem = {
      label: item.label,
      url,
      openInNewTab: item.openInNewTab,
      children: [],
    };
    if (item.parentId) {
      const parent = nodes.get(item.parentId);
      // The parent is hidden (its entry isn't live), so its children are too.
      if (!parent) continue;
      parent.children.push(node);
    } else {
      items.push(node);
    }
    nodes.set(item.id, node);
  }
  return {
    key: menu.key,
    name: menu.name,
    updatedAt: menu.updatedAt.toISOString(),
    items,
  };
}
