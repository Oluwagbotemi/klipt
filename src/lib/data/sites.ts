import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import * as sitesRepo from "@/server/sites";
import { can, type SitePermission } from "@/lib/permissions";
import type { SiteRole, SiteSummary, UserSummary } from "@/lib/types";
import { requireUser } from "@/lib/data/session";

/*
 * Data access layer for sites. Every function resolves the current user from
 * the session and only returns sites that user is a member of. Non-members
 * get "not found" rather than "forbidden", so site ids can't be probed.
 */

export class ForbiddenError extends Error {
  constructor(permission: SitePermission) {
    super(`Missing permission: ${permission}`);
  }
}

export async function getSites(): Promise<SiteSummary[]> {
  const user = await requireUser();
  return sitesRepo.listSitesForUser(await getDb(), user.id);
}

/** The site, if the current user is a member; otherwise renders not-found. */
export const getSite = cache(async (siteId: string): Promise<SiteSummary> => {
  const user = await requireUser();
  const site = await sitesRepo.getSiteForUser(await getDb(), user.id, siteId);
  if (!site) notFound();
  return site;
});

/**
 * Authorizes a site-scoped action. Use at the top of every Server Action and
 * route handler that touches site data; UI checks are display-only.
 */
export async function requireSitePermission(
  siteId: string,
  permission: SitePermission,
): Promise<{ user: UserSummary; role: SiteRole }> {
  const user = await requireUser();
  const role = await sitesRepo.getSiteRole(await getDb(), user.id, siteId);
  if (!role) notFound();
  if (!can(role, permission)) throw new ForbiddenError(permission);
  return { user, role };
}
