"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import { restoreSite } from "@/server/site-settings";
import { requireUser } from "@/lib/data/session";

/** Restores an archived site the user owns. */
export async function restoreSiteAction(siteId: string) {
  const user = await requireUser();
  if (!z.string().min(1).max(64).safeParse(siteId).success) {
    return { ok: false as const, error: "Not found." };
  }
  try {
    await restoreSite(await getDb(), user.id, siteId);
  } catch (error) {
    if (error instanceof NotAllowedError)
      return { ok: false as const, error: "Only the owner can restore it." };
    throw error;
  }
  refresh();
  return { ok: true as const };
}
