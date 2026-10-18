import "server-only";

import { getDb } from "@/server/db";
import * as apiKeysRepo from "@/server/api-keys";
import { requireUser } from "@/lib/data/session";

/** Active API keys for a site. Callers check api_keys.manage first to show a no-access state. */
export async function getApiKeys(siteId: string) {
  const user = await requireUser();
  return apiKeysRepo.listApiKeys(await getDb(), user.id, siteId);
}
