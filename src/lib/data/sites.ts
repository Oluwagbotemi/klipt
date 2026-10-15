import "server-only";

import { MOCK_CURRENT_USER, MOCK_SITES } from "@/lib/mock/fixtures";
import type { SiteSummary, UserSummary } from "@/lib/types";

/*
 * Data access for sites. Currently backed by MOCK fixtures; swap these
 * implementations for real queries (with server-side authorization) once the
 * backend exists. Callers should not need to change.
 */

export const USING_MOCK_DATA = true;

export async function getCurrentUser(): Promise<UserSummary> {
  return MOCK_CURRENT_USER;
}

/** Sites the current user is a member of. */
export async function getSites(): Promise<SiteSummary[]> {
  return [...MOCK_SITES].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSite(siteId: string): Promise<SiteSummary | null> {
  return MOCK_SITES.find((site) => site.id === siteId) ?? null;
}
