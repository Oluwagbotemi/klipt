"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AccountError,
  changeEmail,
  deleteAccount,
  OwnsSitesError,
  revokeOtherSessions,
  revokeSession,
  updateName,
} from "@/server/account";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { requireSession } from "@/lib/data/account";
import { verifyCurrentPassword } from "@/lib/data/session";
import { emailSchema, MAX_PASSWORD, nameSchema, newPasswordSchema } from "@/lib/account";
import type { OwnedSite } from "@/lib/account";

/*
 * Account Server Actions. Each resolves the signed-in user first and changes
 * only that user's account. Email changes, password changes and deletion
 * re-check the current password.
 */

const WRONG_PASSWORD = "That password isn't right.";

type FieldErrors = Record<string, string | undefined>;
export interface AccountFormState<V> {
  values: V;
  errors?: FieldErrors & { form?: string };
  saved?: boolean;
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const password = (formData: FormData, key: string) =>
  text(formData, key).slice(0, MAX_PASSWORD + 1);

export type NameValues = { name: string };

export async function saveNameAction(
  _previous: AccountFormState<NameValues>,
  formData: FormData,
): Promise<AccountFormState<NameValues>> {
  const { user } = await requireSession();
  const values = { name: text(formData, "name") };
  const parsed = nameSchema.safeParse(values.name);
  if (!parsed.success) return { values, errors: { name: parsed.error.issues[0].message } };
  await updateName(await getDb(), user.id, parsed.data);
  refresh();
  return { values: { name: parsed.data }, saved: true };
}

export type EmailValues = { email: string };

export async function changeEmailAction(
  _previous: AccountFormState<EmailValues>,
  formData: FormData,
): Promise<AccountFormState<EmailValues>> {
  const { user } = await requireSession();
  const values = { email: text(formData, "email") };
  const parsed = emailSchema.safeParse(values.email);
  if (!parsed.success) return { values, errors: { email: parsed.error.issues[0].message } };
  if (parsed.data === user.email.toLowerCase()) {
    return { values, errors: { email: "That's already your email." } };
  }
  if (!(await verifyCurrentPassword(password(formData, "password")))) {
    return { values, errors: { password: WRONG_PASSWORD } };
  }
  try {
    const email = await changeEmail(await getDb(), user.id, parsed.data);
    refresh();
    return { values: { email }, saved: true };
  } catch (error) {
    if (error instanceof AccountError) return { values, errors: { email: error.message } };
    throw error;
  }
}

export type PasswordValues = { revokeOthers: boolean };

export async function changePasswordAction(
  _previous: AccountFormState<PasswordValues>,
  formData: FormData,
): Promise<AccountFormState<PasswordValues>> {
  const { user, session } = await requireSession();
  const values = { revokeOthers: formData.get("revokeOthers") === "on" };
  const currentPassword = password(formData, "currentPassword");
  const newPassword = password(formData, "newPassword");
  const errors: FieldErrors = {};
  const parsed = newPasswordSchema.safeParse(newPassword);
  if (!parsed.success) errors.newPassword = parsed.error.issues[0].message;
  else if (newPassword === currentPassword) {
    errors.newPassword = "Choose a password different from your current one.";
  }
  if (password(formData, "confirmPassword") !== newPassword) {
    errors.confirmPassword = "The passwords don't match.";
  }
  if (!currentPassword) errors.currentPassword = "Enter your current password.";
  if (Object.values(errors).some(Boolean)) return { values, errors };
  if (!(await verifyCurrentPassword(currentPassword))) {
    return { values, errors: { currentPassword: WRONG_PASSWORD } };
  }
  const auth = await getAuth();
  try {
    // Better Auth hashes and stores the new password. Its own revokeOtherSessions
    // would also replace this device's session mid-request, so others are signed
    // out here instead and this session stays as it is.
    await auth.api.changePassword({
      body: { currentPassword, newPassword },
      headers: await headers(),
    });
  } catch {
    return { values, errors: { form: "Couldn't change your password. Try again." } };
  }
  if (values.revokeOthers) await revokeOtherSessions(await getDb(), user.id, session.id);
  refresh();
  return { values, saved: true };
}

type Result = { ok: true; count?: number } | { ok: false; error: string };

export async function revokeSessionAction(sessionId: string): Promise<Result> {
  const { user, session } = await requireSession();
  if (!z.string().min(1).max(128).safeParse(sessionId).success) {
    return { ok: false, error: "That device isn't signed in anymore." };
  }
  try {
    const removed = await revokeSession(await getDb(), user.id, sessionId, session.id);
    refresh();
    return removed ? { ok: true } : { ok: false, error: "That device isn't signed in anymore." };
  } catch (error) {
    if (error instanceof AccountError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function revokeOtherSessionsAction(): Promise<Result> {
  const { user, session } = await requireSession();
  const count = await revokeOtherSessions(await getDb(), user.id, session.id);
  refresh();
  return { ok: true, count };
}

export type DeleteResult = { ok: false; error: string; ownedSites?: OwnedSite[] };

export async function deleteAccountAction(input: {
  confirmEmail: string;
  password: string;
}): Promise<DeleteResult> {
  const { user } = await requireSession();
  if (!(await verifyCurrentPassword(String(input.password ?? "").slice(0, MAX_PASSWORD + 1)))) {
    return { ok: false, error: WRONG_PASSWORD };
  }
  try {
    await deleteAccount(await getDb(), user.id, String(input.confirmEmail ?? ""));
  } catch (error) {
    if (error instanceof OwnsSitesError) {
      return { ok: false, error: error.message, ownedSites: error.sites };
    }
    if (error instanceof AccountError) return { ok: false, error: error.message };
    throw error;
  }
  // The session row is gone with the user; this clears the cookie.
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/sign-in?deleted=1");
}
