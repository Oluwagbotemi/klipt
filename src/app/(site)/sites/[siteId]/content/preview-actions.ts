"use server";

import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import { createPreviewLink } from "@/server/previews";
import { requireSitePermission } from "@/lib/data/sites";

const id = z.string().min(1).max(64);

/**
 * A fresh, signed link to preview an entry on the site's own website, or
 * `url: null` when no preview address is set (use Klipt's built-in preview).
 */
export async function previewLinkAction(
  siteId: string,
  entryId: string,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  if (!id.safeParse(siteId).success || !id.safeParse(entryId).success) {
    return { ok: false, error: "That entry couldn't be found." };
  }
  const { user } = await requireSitePermission(siteId, "site.view");
  try {
    const link = await createPreviewLink(await getDb(), user.id, siteId, entryId);
    return { ok: true, url: link?.url ?? null };
  } catch (error) {
    if (error instanceof NotAllowedError) {
      return { ok: false, error: "That entry couldn't be found." };
    }
    throw error;
  }
}
