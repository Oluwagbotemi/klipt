"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db";
import { acceptTransfer, declineTransfer, TransferError } from "@/server/ownership";
import { requireUser } from "@/lib/data/session";
import { siteHref } from "@/lib/navigation";

const token = z.string().min(20).max(100);

export async function respondToTransferAction(
  value: string,
  answer: "accept" | "decline",
): Promise<{ error: string } | { declined: true }> {
  const user = await requireUser();
  if (!token.safeParse(value).success) return { error: "This transfer link isn't valid." };
  let siteId: string;
  try {
    if (answer === "decline") {
      await declineTransfer(await getDb(), user, value);
      return { declined: true };
    }
    siteId = (await acceptTransfer(await getDb(), user, value)).siteId;
  } catch (error) {
    if (error instanceof TransferError) return { error: error.message };
    throw error;
  }
  redirect(siteHref(siteId));
}
