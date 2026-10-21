import { z } from "zod";

/*
 * Navigation menus: shared rules and types for the menu editor (browser) and
 * src/server/menus.ts. A menu is a short tree of links: top-level items plus
 * one level of children (MAX_MENU_DEPTH = 2). Items link to an entry (the link
 * follows the entry's URL) or to a URL.
 */

/** Levels of nesting: top-level items and their children. */
export const MAX_MENU_DEPTH = 2;
export const MAX_MENU_ITEMS = 100;
export const MAX_CUSTOM_MENUS = 20;
export const MAX_LABEL_LENGTH = 80;

/** Every site has these; they're created the first time someone opens Navigation. */
export const SYSTEM_MENUS = [
  { key: "header", name: "Header" },
  { key: "footer", name: "Footer" },
] as const;

export function isSystemMenu(key: string) {
  return SYSTEM_MENUS.some((menu) => menu.key === key);
}

export const menuKeySchema = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9-]{0,39}$/,
    "Use lowercase letters, numbers and hyphens, starting with a letter (up to 40).",
  );

export const menuNameSchema = z
  .string()
  .trim()
  .min(1, "Give the menu a name.")
  .max(60, "Keep the name to 60 characters.");

export const createMenuSchema = z.object({
  name: menuNameSchema,
  key: menuKeySchema.refine((key) => !isSystemMenu(key), "That key is reserved."),
});

/** https, a site-relative path or #fragment, mailto: or tel:. */
export function isAllowedMenuUrl(value: string): boolean {
  const url = value.trim();
  if (!url || url.length > 2000 || /\s/.test(url)) return false;
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  if (url.startsWith("#")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return Boolean(parsed.hostname);
    return parsed.protocol === "mailto:" || parsed.protocol === "tel:";
  } catch {
    return false;
  }
}

export const MENU_URL_HINT = "Use https://…, a path like /pricing, mailto: or tel:.";

/**
 * One item as the editor sends it: a flat list in display order, where
 * `depth` 1 makes an item a child of the closest top-level item above it.
 */
export const menuItemInputSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Every item needs a label.")
      .max(MAX_LABEL_LENGTH, `Keep labels to ${MAX_LABEL_LENGTH} characters.`),
    kind: z.enum(["entry", "url"]),
    entryId: z.string().max(64).nullish(),
    url: z.string().trim().max(2000).nullish(),
    openInNewTab: z.boolean().default(false),
    depth: z
      .number()
      .int()
      .min(0)
      .max(MAX_MENU_DEPTH - 1),
  })
  .superRefine((item, ctx) => {
    if (item.kind === "url" && !isAllowedMenuUrl(item.url ?? "")) {
      ctx.addIssue({ code: "custom", path: ["url"], message: MENU_URL_HINT });
    }
  });
export type MenuItemInput = z.input<typeof menuItemInputSchema>;

export const menuItemsSchema = z
  .array(menuItemInputSchema)
  .max(MAX_MENU_ITEMS, `A menu can have up to ${MAX_MENU_ITEMS} items.`)
  .superRefine((items, ctx) => {
    items.forEach((item, index) => {
      const previous = index === 0 ? -1 : items[index - 1].depth;
      if (item.depth > previous + 1) {
        ctx.addIssue({
          code: "custom",
          path: [index, "depth"],
          message: `"${item.label}" is indented under nothing. Move it out a level.`,
        });
      }
    });
  });

export type MenuItemWarning = "deleted" | "unpublished";

/** A saved item, as the editor shows it. */
export interface MenuItemView {
  id: string;
  label: string;
  kind: "entry" | "url";
  entryId: string | null;
  url: string | null;
  openInNewTab: boolean;
  depth: number;
  /** The linked entry, for entry items whose entry still exists. */
  target: { title: string; status: string; modelName: string; path: string } | null;
  /** Entry items whose entry was deleted or isn't live: left out of the API. */
  warning: MenuItemWarning | null;
}

export interface MenuSummary {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  itemCount: number;
  /** Entry items pointing at something deleted or unpublished. */
  warningCount: number;
  updatedAt: string;
}

export interface MenuDetail {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  /** Optimistic-lock token: send it back when saving. */
  updatedAt: string;
  items: MenuItemView[];
}

/** What the content API returns for one item. */
export interface DeliveryMenuItem {
  label: string;
  url: string;
  openInNewTab: boolean;
  children: DeliveryMenuItem[];
}

export function menuWarningText(warning: MenuItemWarning) {
  return warning === "deleted"
    ? "The linked entry was deleted. This item is hidden on your site."
    : "The linked entry isn't published. This item is hidden on your site until it is.";
}
