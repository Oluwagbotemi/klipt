"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { NotAllowedError } from "@/server/errors";
import { SecretUnavailableError } from "@/server/secrets";
import {
  changeMemberRole,
  createInvitation,
  getInvitationToken,
  removeMember,
  renewInvitation,
  resendInvitation,
  revokeInvitation,
  TeamError,
} from "@/server/team";
import { invitationMessage } from "@/server/notifications";
import { isEmailEnabled, sendLater } from "@/lib/data/email";
import { invitationUrl } from "@/lib/data/team";
import { ForbiddenError, requireSitePermission } from "@/lib/data/sites";
import { INVITATION_DAYS, invitationSchema, type InvitableRole } from "@/lib/team";

/*
 * Team Server Actions. Arguments come from the browser, so everything is
 * validated, and each action authorizes before touching data.
 */

const id = z.string().min(1).max(64);
const NO_PERMISSION = "You don't have permission to do that.";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof TeamError || error instanceof SecretUnavailableError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof ForbiddenError || error instanceof NotAllowedError) {
    return { ok: false, error: NO_PERMISSION };
  }
  throw error;
}

export interface InviteState {
  values: { email: string; role: string };
  errors?: { email?: string; role?: string; form?: string };
  invite?: { email: string; role: InvitableRole; url: string; days: number; emailed: boolean };
}

export async function inviteMemberAction(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const values = {
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { values, errors: { form: "That site couldn't be found." } };
  const parsed = invitationSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return { values, errors: { email: fields.email?.[0], role: fields.role?.[0] } };
  }
  try {
    const { user } = await requireSitePermission(siteId.data, "members.manage");
    const db = await getDb();
    const invitation = await createInvitation(db, user.id, siteId.data, parsed.data);
    const url = await invitationUrl(invitation.token);
    const emailed = emailInvitation(invitation.id, url);
    refresh();
    return {
      values: { email: "", role: parsed.data.role },
      invite: { ...parsed.data, url, days: INVITATION_DAYS, emailed },
    };
  } catch (error) {
    const result = failure(error);
    return { values, errors: { form: result.error } };
  }
}

/** Emails the invitation link after the response. False when email isn't set up. */
function emailInvitation(invitationId: string, url: string) {
  if (!isEmailEnabled()) return false;
  sendLater(async () => {
    const message = await invitationMessage(await getDb(), invitationId, url);
    return message ? [message] : [];
  });
  return true;
}

async function managed<T extends object>(
  siteId: string,
  targetId: string,
  run: (userId: string) => Promise<T>,
): Promise<Result<T>> {
  if (!id.safeParse(siteId).success || !id.safeParse(targetId).success) {
    return { ok: false, error: "Not found." };
  }
  try {
    const { user } = await requireSitePermission(siteId, "site.view");
    return { ok: true, ...(await run(user.id)) };
  } catch (error) {
    return failure(error);
  }
}

export async function invitationLinkAction(siteId: string, invitationId: string) {
  return managed(siteId, invitationId, async (userId) => ({
    url: await invitationUrl(await getInvitationToken(await getDb(), userId, siteId, invitationId)),
  }));
}

export async function renewInvitationAction(siteId: string, invitationId: string) {
  const result = await managed(siteId, invitationId, async (userId) => {
    const url = await invitationUrl(
      await renewInvitation(await getDb(), userId, siteId, invitationId),
    );
    return { url, emailed: emailInvitation(invitationId, url) };
  });
  if (result.ok) refresh();
  return result;
}

/** Emails an open invitation's current link again (at most once a minute). */
export async function resendInvitationEmailAction(siteId: string, invitationId: string) {
  if (!isEmailEnabled()) return { ok: false as const, error: "Email isn't set up for Klipt yet." };
  const result = await managed(siteId, invitationId, async (userId) => {
    const url = await invitationUrl(
      await resendInvitation(await getDb(), userId, siteId, invitationId),
    );
    emailInvitation(invitationId, url);
    return {};
  });
  if (result.ok) refresh();
  return result;
}

export async function cancelInvitationAction(siteId: string, invitationId: string) {
  const result = await managed(siteId, invitationId, async (userId) => {
    await revokeInvitation(await getDb(), userId, siteId, invitationId);
    return {};
  });
  if (result.ok) refresh();
  return result;
}

export async function changeRoleAction(siteId: string, memberId: string, role: string) {
  const result = await managed(siteId, memberId, async (userId) => {
    await changeMemberRole(await getDb(), userId, siteId, memberId, z.string().max(20).parse(role));
    return {};
  });
  if (result.ok) refresh();
  return result;
}

/** Removes a member; when it's the current user, they leave and go back to their sites. */
export async function removeMemberAction(siteId: string, memberId: string) {
  let leaving = false;
  const result = await managed(siteId, memberId, async (userId) => {
    leaving = userId === memberId;
    await removeMember(await getDb(), userId, siteId, memberId);
    return {};
  });
  if (result.ok && leaving) redirect("/sites");
  if (result.ok) refresh();
  return result;
}
