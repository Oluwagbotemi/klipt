"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import { setPreviewUrl } from "@/server/previews";
import { requireSitePermission } from "@/lib/data/sites";
import { previewUrlSchema } from "@/lib/previews";

const id = z.string().min(1).max(64);

export interface PreviewUrlState {
  values: { previewUrl: string };
  errors?: { previewUrl?: string; form?: string };
  saved?: boolean;
}

/** Saves (or clears) the site's preview address. */
export async function savePreviewUrlAction(
  _previous: PreviewUrlState,
  formData: FormData,
): Promise<PreviewUrlState> {
  const values = { previewUrl: String(formData.get("previewUrl") ?? "") };
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  const parsed = previewUrlSchema.safeParse(values.previewUrl);
  if (!parsed.success) return { values, errors: { previewUrl: parsed.error.issues[0].message } };
  // Settings are for owners and admins; setPreviewUrl re-checks the exact rule.
  const { user } = await requireSitePermission(siteId.data, "site.view");
  try {
    const saved = await setPreviewUrl(await getDb(), user.id, siteId.data, values.previewUrl);
    refresh();
    return { values: { previewUrl: saved ?? "" }, saved: true };
  } catch (error) {
    if (error instanceof NotAllowedError) {
      return {
        values,
        errors: { form: "You don't have permission to change previews on this site." },
      };
    }
    throw error;
  }
}
