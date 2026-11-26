"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import {
  applyBuildingPreset,
  finishOnboarding,
  getOnboardingState,
  saveOnboardingAnswers,
} from "@/server/onboarding";
import { createSite, DomainTakenError, getSiteRole } from "@/server/sites";
import { requireUser } from "@/lib/data/session";
import { siteHref } from "@/lib/navigation";
import { buildingSchema, roleSchema } from "@/lib/onboarding";
import { createSiteSchema } from "@/lib/validation/site";

/*
 * Welcome flow Server Actions. Each one resolves the signed-in person first;
 * site-scoped steps (invite, API key) reuse the Team and Integrations actions,
 * which authorize with requireSitePermission.
 */

const siteId = z.string().min(1).max(64);

/** A site id from the form, only if the person is a member of it. */
async function memberSite(userId: string, value: FormDataEntryValue | null) {
  const parsed = siteId.safeParse(value);
  if (!parsed.success) return null;
  return (await getSiteRole(await getDb(), userId, parsed.data)) ? parsed.data : null;
}

export interface ChoiceState {
  error?: string;
}

export async function chooseRoleAction(
  _previous: ChoiceState,
  formData: FormData,
): Promise<ChoiceState> {
  const user = await requireUser();
  const role = roleSchema.safeParse(formData.get("role"));
  if (!role.success) return { error: "Choose the option that fits you best." };
  const db = await getDb();
  await saveOnboardingAnswers(db, user.id, { role: role.data });
  // People who joined through an invitation only answer this; then their site.
  const joined = await memberSite(user.id, formData.get("joined"));
  if (joined) {
    await finishOnboarding(db, user.id);
    redirect(siteHref(joined));
  }
  redirect("/welcome?step=building");
}

export async function chooseBuildingAction(
  _previous: ChoiceState,
  formData: FormData,
): Promise<ChoiceState> {
  const user = await requireUser();
  const building = buildingSchema.safeParse(formData.get("building"));
  if (!building.success) return { error: "Choose what you're building." };
  await saveOnboardingAnswers(await getDb(), user.id, { building: building.data });
  redirect("/welcome?step=site");
}

export interface FirstSiteState {
  values: { name: string; domain: string };
  errors?: { name?: string; domain?: string; form?: string };
}

/** Creates the first site like Create site does, then applies the "building" preset. */
export async function createFirstSiteAction(
  _previous: FirstSiteState,
  formData: FormData,
): Promise<FirstSiteState> {
  const user = await requireUser();
  const values = {
    name: String(formData.get("name") ?? ""),
    domain: String(formData.get("domain") ?? ""),
  };
  const parsed = createSiteSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return { values, errors: { name: fields.name?.[0], domain: fields.domain?.[0] } };
  }

  const db = await getDb();
  let id: string;
  try {
    id = (await createSite(db, user.id, parsed.data)).id;
  } catch (error) {
    if (error instanceof DomainTakenError) return { values, errors: { domain: error.message } };
    console.error("createSite failed", error);
    return {
      values,
      errors: { form: "We couldn't create the site. Nothing was saved; try again." },
    };
  }

  const { building } = await getOnboardingState(db, user.id);
  if (building) {
    try {
      await applyBuildingPreset(db, user.id, id, building);
    } catch (error) {
      // The site exists either way; the preset is a convenience.
      console.error("applyBuildingPreset failed", error);
    }
  }
  redirect(`/welcome?step=team&site=${id}`);
}

/** "Skip for now": the flow won't show again; go to the new site, or the Sites list. */
export async function skipOnboardingAction(formData: FormData) {
  const user = await requireUser();
  await finishOnboarding(await getDb(), user.id);
  const site = await memberSite(user.id, formData.get("site"));
  redirect(site ? siteHref(site) : "/sites");
}

/** The last step: open the new site's Overview with a short welcome. */
export async function finishOnboardingAction(formData: FormData) {
  const user = await requireUser();
  await finishOnboarding(await getDb(), user.id);
  const site = await memberSite(user.id, formData.get("site"));
  redirect(site ? `${siteHref(site, "overview")}?welcome=1` : "/sites");
}
