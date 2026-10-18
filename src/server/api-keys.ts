import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { apiKeys, auditEvents, sites, users } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import { API_KEY_PREFIX, MAX_API_KEYS, apiKeyNameSchema, type ApiKeySummary } from "@/lib/api-keys";
import { can } from "@/lib/permissions";

/*
 * Content API keys. Management functions take an explicit userId and require
 * the api_keys.manage permission on the site. Keys are 32 random bytes; only
 * their SHA-256 hash is stored, so a database leak doesn't expose usable keys.
 */

export class ApiKeyLimitError extends Error {
  constructor() {
    super(`A site can have up to ${MAX_API_KEYS} active keys. Revoke one you no longer use.`);
  }
}

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function requireManager(db: DbOrTx, userId: string, siteId: string) {
  const role = await getSiteRole(db, userId, siteId);
  if (!role || !can(role, "api_keys.manage")) {
    throw new NotAllowedError("Not allowed to manage API keys.");
  }
}

export async function listApiKeys(
  db: DbOrTx,
  userId: string,
  siteId: string,
): Promise<ApiKeySummary[]> {
  await requireManager(db, userId, siteId);
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdByName: users.name,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .leftJoin(users, eq(users.id, apiKeys.createdById))
    .where(and(eq(apiKeys.siteId, siteId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

/** Creates a key and returns it once, in full. */
export async function createApiKey(
  db: DbOrTx,
  userId: string,
  siteId: string,
  name: string,
): Promise<{ id: string; token: string }> {
  const cleanName = apiKeyNameSchema.parse(name);
  return db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    // Serialize key creation per site so the limit can't be raced past.
    await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for("update");
    const [{ active }] = await tx
      .select({ active: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.siteId, siteId), isNull(apiKeys.revokedAt)));
    if (active >= MAX_API_KEYS) throw new ApiKeyLimitError();

    const token = API_KEY_PREFIX + randomBytes(32).toString("base64url");
    const [key] = await tx
      .insert(apiKeys)
      .values({
        siteId,
        name: cleanName,
        prefix: token.slice(0, API_KEY_PREFIX.length + 6),
        tokenHash: hashApiKey(token),
        createdById: userId,
      })
      .returning({ id: apiKeys.id });
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "api_key.created",
      targetType: "api_key",
      targetId: key.id,
      metadata: { name: cleanName },
    });
    return { id: key.id, token };
  });
}

/** Revokes a key immediately. Revoked keys stay in the database for the audit trail. */
export async function revokeApiKey(db: DbOrTx, userId: string, siteId: string, keyId: string) {
  return db.transaction(async (tx) => {
    await requireManager(tx, userId, siteId);
    const [key] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.siteId, siteId), eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id, name: apiKeys.name });
    if (!key) throw new NotAllowedError("Key not found.");
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "api_key.revoked",
      targetType: "api_key",
      targetId: key.id,
      metadata: { name: key.name },
    });
  });
}

const LAST_USED_GRANULARITY_MS = 5 * 60 * 1000;

/**
 * Resolves a bearer token to its site. Returns null for unknown or revoked
 * keys and for archived sites. Records "last used" at most every 5 minutes.
 */
export async function authenticateApiKey(
  db: DbOrTx,
  token: string,
): Promise<{ keyId: string; siteId: string } | null> {
  if (!token.startsWith(API_KEY_PREFIX) || token.length > 200) return null;
  const [key] = await db
    .select({ keyId: apiKeys.id, siteId: apiKeys.siteId })
    .from(apiKeys)
    .innerJoin(sites, eq(sites.id, apiKeys.siteId))
    .where(
      and(
        eq(apiKeys.tokenHash, hashApiKey(token)),
        isNull(apiKeys.revokedAt),
        isNull(sites.archivedAt),
      ),
    )
    .limit(1);
  if (!key) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, key.keyId),
        or(
          isNull(apiKeys.lastUsedAt),
          lt(apiKeys.lastUsedAt, new Date(Date.now() - LAST_USED_GRANULARITY_MS)),
        ),
      ),
    );
  return key;
}
