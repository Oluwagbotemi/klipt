import "server-only";

import { getDb } from "@/server/db";
import { getPreviewUrl } from "@/server/previews";
import { requireUser } from "@/lib/data/session";

/** The site's preview address on its own website, or null (Klipt's built-in preview). */
export async function getSitePreviewUrl(siteId: string) {
  const user = await requireUser();
  return getPreviewUrl(await getDb(), user.id, siteId);
}
