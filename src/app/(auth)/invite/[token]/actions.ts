"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { acceptInvitation, TeamError } from "@/server/team";
import { requireUser } from "@/lib/data/session";
import { siteHref } from "@/lib/navigation";

/** Accepts an invitation for the signed-in account, then opens the site. */
export async function acceptInvitationAction(token: string): Promise<{ error: string }> {
  const user = await requireUser();
  if (!z.string().min(20).max(100).safeParse(token).success) {
    return { error: "This invitation link isn't valid." };
  }
  let siteId: string;
  try {
    siteId = (await acceptInvitation(await getDb(), user, token)).siteId;
  } catch (error) {
    if (error instanceof TeamError) return { error: error.message };
    throw error;
  }
  redirect(siteHref(siteId));
}
