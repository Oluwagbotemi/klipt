import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { sites } from "@/server/db/schema";
import type { WorkflowRules } from "@/lib/content";
import { DEFAULT_PATH_RULES, type PathRules } from "@/lib/url-patterns";

/*
 * Site rules other modules need on every read: URL patterns (for entryPath)
 * and the review rule (for workflowActions). Kept apart from
 * src/server/publishing.ts so webhooks and delivery can use them without an
 * import cycle.
 */

/** The site's URL rules. Load once per request and pass them to entryPath(). */
export async function loadPathRules(db: DbOrTx, siteId: string): Promise<PathRules> {
  const [site] = await db
    .select({ patterns: sites.urlPatterns, timeZone: sites.timezone })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  return site ? { patterns: site.patterns ?? {}, timeZone: site.timeZone } : DEFAULT_PATH_RULES;
}

export async function loadWorkflowRules(db: DbOrTx, siteId: string): Promise<WorkflowRules> {
  const [site] = await db
    .select({ requireReview: sites.requireReview })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  return { requireReview: site?.requireReview ?? false };
}
