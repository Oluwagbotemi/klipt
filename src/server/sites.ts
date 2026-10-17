import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { isUniqueViolation } from "@/server/db/errors";
import {
  auditEvents,
  contentModels,
  siteMembers,
  siteOwnershipTransfers,
  sites,
  users,
} from "@/server/db/schema";
import type { SiteRole, SiteSummary } from "@/lib/types";
import type { CreateSiteInput } from "@/lib/validation/site";

/*
 * Site queries. These take the acting user's id explicitly and always scope
 * results to that user's memberships. Call them through the data layer
 * (src/lib/data/sites.ts), which resolves the user from the session.
 */

export class DomainTakenError extends Error {
  constructor() {
    super("That domain is already connected to another site.");
  }
}

async function toSummaries(
  db: DbOrTx,
  rows: { site: typeof sites.$inferSelect; role: SiteRole }[],
): Promise<SiteSummary[]> {
  if (rows.length === 0) return [];
  const siteIds = rows.map((row) => row.site.id);

  const [owners, pending] = await Promise.all([
    db
      .select({ siteId: siteMembers.siteId, id: users.id, name: users.name, email: users.email })
      .from(siteMembers)
      .innerJoin(users, eq(users.id, siteMembers.userId))
      .where(and(inArray(siteMembers.siteId, siteIds), eq(siteMembers.role, "owner"))),
    db
      .select()
      .from(siteOwnershipTransfers)
      .where(
        and(
          inArray(siteOwnershipTransfers.siteId, siteIds),
          eq(siteOwnershipTransfers.status, "pending"),
        ),
      ),
  ]);

  const ownerBySite = new Map(owners.map((o) => [o.siteId, o]));
  const pendingBySite = new Map(pending.map((t) => [t.siteId, t]));

  return rows.flatMap(({ site, role }) => {
    const owner = ownerBySite.get(site.id);
    if (!owner) return []; // Unreachable while the one-owner invariant holds.
    const transfer = pendingBySite.get(site.id);
    return [
      {
        id: site.id,
        name: site.name,
        domain: site.domain,
        publishState: site.publishState,
        owner: { id: owner.id, name: owner.name, email: owner.email },
        currentUserRole: role,
        updatedAt: site.updatedAt.toISOString(),
        // Only owners and admins see who a pending transfer is addressed to.
        pendingTransfer:
          transfer && (role === "owner" || role === "admin")
            ? {
                status: "pending" as const,
                recipientEmail: transfer.recipientEmail,
                initiatedAt: transfer.createdAt.toISOString(),
              }
            : null,
      },
    ];
  });
}

export async function listSitesForUser(db: DbOrTx, userId: string): Promise<SiteSummary[]> {
  const rows = await db
    .select({ site: sites, role: siteMembers.role })
    .from(siteMembers)
    .innerJoin(sites, eq(sites.id, siteMembers.siteId))
    .where(and(eq(siteMembers.userId, userId), isNull(sites.archivedAt)));

  const summaries = await toSummaries(db, rows);
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Returns the site only if the user is a member of it; otherwise null. */
export async function getSiteForUser(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<SiteSummary | null> {
  const rows = await db
    .select({ site: sites, role: siteMembers.role })
    .from(siteMembers)
    .innerJoin(sites, eq(sites.id, siteMembers.siteId))
    .where(
      and(eq(siteMembers.userId, userId), eq(siteMembers.siteId, siteId), isNull(sites.archivedAt)),
    )
    .limit(1);

  const [summary] = await toSummaries(db, rows);
  return summary ?? null;
}

export async function getSiteRole(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<SiteRole | null> {
  const [row] = await db
    .select({ role: siteMembers.role })
    .from(siteMembers)
    .innerJoin(sites, eq(sites.id, siteMembers.siteId))
    .where(
      and(eq(siteMembers.userId, userId), eq(siteMembers.siteId, siteId), isNull(sites.archivedAt)),
    )
    .limit(1);
  return row?.role ?? null;
}

/** Built-in content models every new site starts with. */
const SYSTEM_MODELS = [
  {
    key: "page",
    name: "Page",
    description: "Standalone pages such as Home, About, or Contact.",
    schemaType: "WebPage",
  },
  {
    key: "post",
    name: "Post",
    description: "Dated articles for a blog or news section.",
    schemaType: "Article",
  },
] as const;

/** Creates a site owned by `userId`, with default content models, in one transaction. */
export async function createSite(
  db: DbOrTx,
  userId: string,
  input: CreateSiteInput,
): Promise<{ id: string }> {
  try {
    return await insertSite(db, userId, input);
  } catch (error) {
    // A concurrent insert can still win the race past the pre-check below.
    if (isUniqueViolation(error, "sites_domain_unique")) throw new DomainTakenError();
    throw error;
  }
}

function insertSite(db: DbOrTx, userId: string, input: CreateSiteInput) {
  return db.transaction(async (tx) => {
    if (input.domain) {
      const [existing] = await tx
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.domain, input.domain))
        .limit(1);
      if (existing) throw new DomainTakenError();
    }

    const [site] = await tx
      .insert(sites)
      .values({ name: input.name, domain: input.domain })
      .returning({ id: sites.id });

    await tx.insert(siteMembers).values({ siteId: site.id, userId, role: "owner" });
    await tx
      .insert(contentModels)
      .values(SYSTEM_MODELS.map((model) => ({ ...model, siteId: site.id, isSystem: true })));
    await tx.insert(auditEvents).values({
      siteId: site.id,
      actorId: userId,
      action: "site.created",
      targetType: "site",
      targetId: site.id,
      metadata: { name: input.name, domain: input.domain },
    });

    return site;
  });
}
