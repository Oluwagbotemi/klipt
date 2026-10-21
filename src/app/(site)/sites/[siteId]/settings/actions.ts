"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import {
  cancelTransfer,
  getOwnershipState,
  renewTransferLink,
  startTransfer,
  TransferError,
  transferLinkToken,
} from "@/server/ownership";
import { transferRequestMessage } from "@/server/notifications";
import { SecretUnavailableError } from "@/server/secrets";
import {
  archiveSite,
  deleteSite,
  DomainTakenError,
  updateDomain,
  updateGeneralSettings,
  updateSeoDefaults,
} from "@/server/site-settings";
import { getStorage, StorageNotConfiguredError } from "@/server/storage";
import { isEmailEnabled, sendLater } from "@/lib/data/email";
import { verifyCurrentPassword } from "@/lib/data/session";
import { transferUrl } from "@/lib/data/settings";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { domainSchema, generalSettingsSchema, seoDefaultsSchema } from "@/lib/site-settings";

/*
 * Settings Server Actions. Arguments come from the browser, so everything is
 * validated; each action authorizes first, and the riskiest ones (transfer,
 * archive, delete) also re-check the owner's password.
 */

const id = z.string().min(1).max(64);
const NO_PERMISSION = "You don't have permission to change this setting.";
const WRONG_PASSWORD = "That password isn't right.";

type FieldErrors = Record<string, string | undefined>;
export interface FormState<V> {
  values: V;
  errors?: FieldErrors & { form?: string };
  saved?: boolean;
}

function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

function siteIdFrom(formData: FormData) {
  return id.safeParse(formData.get("siteId"));
}

export type GeneralValues = { name: string; language: string; timezone: string };

export async function saveGeneralAction(
  _previous: FormState<GeneralValues>,
  formData: FormData,
): Promise<FormState<GeneralValues>> {
  const values = {
    name: String(formData.get("name") ?? ""),
    language: String(formData.get("language") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
  };
  const siteId = siteIdFrom(formData);
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  const parsed = generalSettingsSchema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };
  try {
    const { user } = await requireSitePermission(siteId.data, "site.update");
    await updateGeneralSettings(await getDb(), user.id, siteId.data, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: NO_PERMISSION } };
    }
    throw error;
  }
  refresh();
  return { values: parsed.data, saved: true };
}

export async function saveDomainAction(
  _previous: FormState<{ domain: string }>,
  formData: FormData,
): Promise<FormState<{ domain: string }>> {
  const values = { domain: String(formData.get("domain") ?? "") };
  const siteId = siteIdFrom(formData);
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  const parsed = domainSchema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };
  try {
    const { user } = await requireSitePermission(siteId.data, "site.update");
    await updateDomain(await getDb(), user.id, siteId.data, values);
  } catch (error) {
    if (error instanceof DomainTakenError) return { values, errors: { domain: error.message } };
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: NO_PERMISSION } };
    }
    throw error;
  }
  refresh();
  return { values: { domain: parsed.data.domain ?? "" }, saved: true };
}

export type SeoDefaultValues = { titleTemplate: string; ogImageId: string };

export async function saveSeoDefaultsAction(
  _previous: FormState<SeoDefaultValues>,
  formData: FormData,
): Promise<FormState<SeoDefaultValues>> {
  const values = {
    titleTemplate: String(formData.get("titleTemplate") ?? ""),
    ogImageId: String(formData.get("ogImageId") ?? ""),
  };
  const siteId = siteIdFrom(formData);
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  const parsed = seoDefaultsSchema.safeParse(values);
  if (!parsed.success) return { values, errors: fieldErrors(parsed.error) };
  try {
    const { user } = await requireSitePermission(siteId.data, "seo.manage");
    await updateSeoDefaults(await getDb(), user.id, siteId.data, parsed.data);
  } catch (error) {
    if (error instanceof NotAllowedError && !(error instanceof ForbiddenError)) {
      return { values, errors: { form: error.message } };
    }
    if (error instanceof ForbiddenError) return { values, errors: { form: NO_PERMISSION } };
    throw error;
  }
  refresh();
  return { values, saved: true };
}

// ---------------------------------------------------------------------------
// Ownership transfer
// ---------------------------------------------------------------------------

export type TransferValues = { email: string; retainAdmin: boolean };

export async function startTransferAction(
  _previous: FormState<TransferValues> & { url?: string; emailed?: boolean },
  formData: FormData,
): Promise<FormState<TransferValues> & { url?: string; emailed?: boolean }> {
  const values = {
    email: String(formData.get("email") ?? ""),
    retainAdmin: formData.get("retainAdmin") === "on",
  };
  const siteId = siteIdFrom(formData);
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  try {
    const { user } = await requireSitePermission(siteId.data, "site.transfer_ownership");
    if (!(await verifyCurrentPassword(String(formData.get("password") ?? "")))) {
      return { values, errors: { password: WRONG_PASSWORD } };
    }
    const token = await startTransfer(await getDb(), user, siteId.data, {
      email: values.email,
      previousOwnerRetainsAdmin: values.retainAdmin,
    });
    const url = await transferUrl(token);
    const emailed = emailTransfer(siteId.data, user.id, values.email, url);
    refresh();
    return { values, url, emailed };
  } catch (error) {
    if (error instanceof TransferError) return { values, errors: { email: error.message } };
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { values, errors: { form: "Only the owner can transfer this site." } };
    }
    throw error;
  }
}

/** Emails the transfer link to the recipient after the response. */
function emailTransfer(siteId: string, ownerId: string, recipientEmail: string, url: string) {
  if (!isEmailEnabled()) return false;
  sendLater(async () => [
    await transferRequestMessage(await getDb(), {
      siteId,
      ownerId,
      recipientEmail: recipientEmail.trim().toLowerCase(),
      url,
    }),
  ]);
  return true;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function ownerAction<T extends object>(
  siteId: string,
  run: (userId: string) => Promise<T>,
): Promise<Result<T>> {
  if (!id.safeParse(siteId).success) return { ok: false, error: "Not found." };
  try {
    const { user } = await requireSitePermission(siteId, "site.transfer_ownership");
    return { ok: true, ...(await run(user.id)) };
  } catch (error) {
    if (error instanceof TransferError || error instanceof SecretUnavailableError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false, error: "Only the owner can do this." };
    }
    throw error;
  }
}

export async function transferLinkAction(siteId: string) {
  return ownerAction(siteId, async (userId) => ({
    url: await transferUrl(await transferLinkToken(await getDb(), userId, siteId)),
  }));
}

export async function renewTransferLinkAction(siteId: string) {
  const result = await ownerAction(siteId, async (userId) => {
    const db = await getDb();
    const url = await transferUrl(await renewTransferLink(db, userId, siteId));
    const { pending } = await getOwnershipState(db, userId, siteId);
    const emailed = pending ? emailTransfer(siteId, userId, pending.recipientEmail, url) : false;
    return { url, emailed };
  });
  if (result.ok) refresh();
  return result;
}

export async function cancelTransferAction(siteId: string) {
  const result = await ownerAction(siteId, async (userId) => {
    await cancelTransfer(await getDb(), userId, siteId);
    return {};
  });
  if (result.ok) refresh();
  return result;
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

export async function archiveSiteAction(siteId: string, password: string): Promise<Result> {
  if (!id.safeParse(siteId).success) return { ok: false, error: "Not found." };
  try {
    const { user } = await requireSitePermission(siteId, "site.archive");
    if (!(await verifyCurrentPassword(password))) return { ok: false, error: WRONG_PASSWORD };
    await archiveSite(await getDb(), user.id, siteId);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false, error: "Only the owner can archive this site." };
    }
    throw error;
  }
  redirect("/sites?archived=1");
}

export async function deleteSiteAction(
  siteId: string,
  input: { confirmName: string; password: string },
): Promise<Result> {
  if (!id.safeParse(siteId).success) return { ok: false, error: "Not found." };
  try {
    const { user } = await requireSitePermission(siteId, "site.delete");
    if (!(await verifyCurrentPassword(input.password))) return { ok: false, error: WRONG_PASSWORD };
    let storage = null;
    try {
      storage = getStorage();
    } catch (error) {
      if (!(error instanceof StorageNotConfiguredError)) throw error;
    }
    await deleteSite(await getDb(), storage, user.id, siteId, String(input.confirmName ?? ""));
  } catch (error) {
    if (error instanceof NotAllowedError && error.message.includes("exactly")) {
      return { ok: false, error: error.message };
    }
    if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
      return { ok: false, error: "Only the owner can delete this site." };
    }
    throw error;
  }
  redirect("/sites?deleted=1");
}
