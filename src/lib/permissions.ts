import type { SiteRole } from "@/lib/types";

/*
 * Provisional permission matrix (the product doc marks it as not final).
 * Enforcement always happens on the server via requireSitePermission();
 * client code may use can() only to decide what to display.
 */

const ALL: SiteRole[] = ["owner", "admin", "editor", "author", "viewer"];

export const PERMISSIONS = {
  "site.view": ALL,
  "site.update": ["owner", "admin"],
  "site.archive": ["owner"],
  "site.delete": ["owner"],
  "site.transfer_ownership": ["owner"],
  "billing.manage": ["owner"],
  "members.manage": ["owner", "admin"],
  "models.manage": ["owner", "admin"],
  "content.create": ["owner", "admin", "editor", "author"],
  "content.edit_any": ["owner", "admin", "editor"],
  "content.publish": ["owner", "admin", "editor"],
  "seo.manage": ["owner", "admin", "editor"],
  "media.upload": ["owner", "admin", "editor", "author"],
  "api_keys.manage": ["owner", "admin"],
  "webhooks.manage": ["owner", "admin"],
} as const satisfies Record<string, readonly SiteRole[]>;

export type SitePermission = keyof typeof PERMISSIONS;

export function can(role: SiteRole, permission: SitePermission): boolean {
  return (PERMISSIONS[permission] as readonly SiteRole[]).includes(role);
}
