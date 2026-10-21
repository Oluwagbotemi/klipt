"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { transferAnsweredMessage } from "@/server/notifications";
import { acceptTransfer, declineTransfer, TransferError } from "@/server/ownership";
import { appOrigin, sendLater } from "@/lib/data/email";
import { requireUser } from "@/lib/data/session";
import { siteHref } from "@/lib/navigation";

const token = z.string().min(20).max(100);

export async function respondToTransferAction(
  value: string,
  answer: "accept" | "decline",
): Promise<{ error: string } | { declined: true }> {
  const user = await requireUser();
  if (!token.safeParse(value).success) return { error: "This transfer link isn't valid." };
  const origin = await appOrigin();
  // Tells the previous owner how it went (after the response).
  const tellOwner = (siteId: string, fromUserId: string | null, retainedAdmin: boolean) =>
    sendLater(async () => {
      const message = await transferAnsweredMessage(await getDb(), {
        siteId,
        fromUserId,
        recipient: user,
        accepted: answer === "accept",
        retainedAdmin,
        origin,
      });
      return message ? [message] : [];
    });

  let siteId: string;
  try {
    if (answer === "decline") {
      const declined = await declineTransfer(await getDb(), user, value);
      tellOwner(declined.siteId, declined.fromUserId, false);
      return { declined: true };
    }
    const accepted = await acceptTransfer(await getDb(), user, value);
    tellOwner(accepted.siteId, accepted.fromUserId, accepted.previousOwnerRetainsAdmin);
    siteId = accepted.siteId;
  } catch (error) {
    if (error instanceof TransferError) return { error: error.message };
    throw error;
  }
  redirect(siteHref(siteId));
}
