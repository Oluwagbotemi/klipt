"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import { rotateIngestKey } from "@/server/performance";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";

/* Performance Server Actions; each authorizes before touching data. */

const id = z.string().min(1).max(64);

/** Replaces the Core Web Vitals reporting key. The old key stops working immediately. */
export async function rotateIngestKeyAction(
  siteId: string,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const parsed = id.safeParse(siteId);
  if (!parsed.success) return { ok: false, error: "That site couldn't be found." };
  try {
    const { user } = await requireSitePermission(parsed.data, "performance.manage");
    const key = await rotateIngestKey(await getDb(), user.id, parsed.data);
    refresh();
    return { ok: true, key };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false, error: "Only owners and admins can replace the reporting key." };
    }
    throw error;
  }
}
