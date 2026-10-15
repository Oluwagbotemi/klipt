"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { createSite, DomainTakenError } from "@/server/sites";
import { requireUser } from "@/lib/data/session";
import { siteHref } from "@/lib/navigation";
import { createSiteSchema } from "@/lib/validation/site";

export interface CreateSiteState {
  values: { name: string; domain: string };
  errors?: { name?: string; domain?: string; form?: string };
}

export async function createSiteAction(
  _previous: CreateSiteState,
  formData: FormData,
): Promise<CreateSiteState> {
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

  let siteId: string;
  try {
    siteId = (await createSite(await getDb(), user.id, parsed.data)).id;
  } catch (error) {
    if (error instanceof DomainTakenError) {
      return { values, errors: { domain: error.message } };
    }
    console.error("createSite failed", error);
    return {
      values,
      errors: { form: "We couldn't create the site. Nothing was saved; try again." },
    };
  }

  redirect(siteHref(siteId));
}
