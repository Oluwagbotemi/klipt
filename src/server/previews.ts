import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { auditEvents, contentEntries, contentModels, sites } from "@/server/db/schema";
import { NotAllowedError } from "@/server/errors";
import { getSiteRole } from "@/server/sites";
import { can } from "@/lib/permissions";
import { buildPreviewLink, PREVIEW_TTL_SECONDS, previewUrlSchema } from "@/lib/previews";
import { entryPath } from "@/lib/seo";

/*
 * Draft previews. A preview token is a signed, short-lived statement "show
 * entry E of site S until time T". It needs no database row: the signature
 * (HMAC-SHA256, key derived from BETTER_AUTH_SECRET) proves Klipt issued it.
 * The customer's website exchanges it, together with its API key, for the
 * entry's current content at GET /api/v1/preview.
 */

export interface PreviewClaims {
  siteId: string;
  entryId: string;
  /** Expiry, unix seconds. */
  exp: number;
}

export type PreviewTokenResult =
  { ok: true; claims: PreviewClaims } | { ok: false; reason: "invalid" | "expired" };

function key(): Buffer {
  const appSecret = process.env.BETTER_AUTH_SECRET;
  if (!appSecret) throw new Error("BETTER_AUTH_SECRET must be set to sign preview links.");
  return Buffer.from(hkdfSync("sha256", appSecret, "klipt", "preview-tokens/v1", 32));
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest();

export function signPreviewToken(
  claims: Omit<PreviewClaims, "exp">,
  options: { ttlSeconds?: number; now?: number } = {},
): { token: string; expiresAt: Date } {
  const now = options.now ?? Date.now();
  const exp = Math.floor(now / 1000) + (options.ttlSeconds ?? PREVIEW_TTL_SECONDS);
  const payload = Buffer.from(
    JSON.stringify({ s: claims.siteId, e: claims.entryId, x: exp }),
  ).toString("base64url");
  return {
    token: `${payload}.${sign(payload).toString("base64url")}`,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifyPreviewToken(token: string, now = Date.now()): PreviewTokenResult {
  if (typeof token !== "string" || token.length > 1000) return { ok: false, reason: "invalid" };
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return { ok: false, reason: "invalid" };
  const expected = sign(payload);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid" };
  }
  let data: { s?: unknown; e?: unknown; x?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof data.s !== "string" || typeof data.e !== "string" || typeof data.x !== "number") {
    return { ok: false, reason: "invalid" };
  }
  if (data.x * 1000 <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims: { siteId: data.s, entryId: data.e, exp: data.x } };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const canConfigure = (role: Parameters<typeof can>[0]) =>
  can(role, "site.update") || can(role, "api_keys.manage");

export async function getPreviewUrl(db: DbOrTx, userId: string, siteId: string) {
  if (!(await getSiteRole(db, userId, siteId))) throw new NotAllowedError("Not a member.");
  const [site] = await db
    .select({ previewUrl: sites.previewUrl })
    .from(sites)
    .where(eq(sites.id, siteId));
  return site?.previewUrl ?? null;
}

/** Sets (or clears, with "") the address on the website that shows drafts. */
export async function setPreviewUrl(db: DbOrTx, userId: string, siteId: string, input: string) {
  const previewUrl = previewUrlSchema.parse(input);
  await db.transaction(async (tx) => {
    const role = await getSiteRole(tx, userId, siteId);
    if (!role || !canConfigure(role)) throw new NotAllowedError("Can't change previews.");
    await tx.update(sites).set({ previewUrl, updatedAt: new Date() }).where(eq(sites.id, siteId));
    await tx.insert(auditEvents).values({
      siteId,
      actorId: userId,
      action: "previews.url_changed",
      targetType: "site",
      targetId: siteId,
      metadata: { previewUrl },
    });
  });
  return previewUrl;
}

/**
 * A preview link for one entry, for any member who can see the site.
 * Returns null when the site has no preview address (use Klipt's own preview).
 */
export async function createPreviewLink(
  db: DbOrTx,
  userId: string,
  siteId: string,
  entryId: string,
): Promise<{ url: string; expiresAt: string } | null> {
  if (!(await getSiteRole(db, userId, siteId))) throw new NotAllowedError("Not a member.");
  const [row] = await db
    .select({
      slug: contentEntries.slug,
      status: contentEntries.status,
      modelKey: contentModels.key,
      previewUrl: sites.previewUrl,
    })
    .from(contentEntries)
    .innerJoin(contentModels, eq(contentModels.id, contentEntries.modelId))
    .innerJoin(sites, eq(sites.id, contentEntries.siteId))
    .where(and(eq(contentEntries.siteId, siteId), eq(contentEntries.id, entryId)))
    .limit(1);
  if (!row) throw new NotAllowedError("Entry not found.");
  if (!row.previewUrl) return null;
  const { token, expiresAt } = signPreviewToken({ siteId, entryId });
  return {
    url: buildPreviewLink(row.previewUrl, {
      token,
      type: row.modelKey,
      slug: row.slug,
      path: entryPath(row.modelKey, row.slug),
    }),
    expiresAt: expiresAt.toISOString(),
  };
}
