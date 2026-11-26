import "server-only";

import { cache } from "react";
import { getDb } from "@/server/db";
import { getOnboardingState } from "@/server/onboarding";
import { getSiteForUser } from "@/server/sites";
import { needsOnboarding } from "@/lib/onboarding";
import { requireUser } from "@/lib/data/session";

/** The signed-in person's welcome-flow answers and whether it still applies. */
export const getOnboarding = cache(async () => {
  const user = await requireUser();
  const state = await getOnboardingState(await getDb(), user.id);
  return { user, state, needed: needsOnboarding(state) };
});

/** A site from the URL, only if the signed-in person is a member; otherwise null. */
export async function getMemberSite(siteId: string | string[] | undefined) {
  if (typeof siteId !== "string" || siteId.length === 0 || siteId.length > 64) return null;
  const user = await requireUser();
  return getSiteForUser(await getDb(), user.id, siteId);
}
