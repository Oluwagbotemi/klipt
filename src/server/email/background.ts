import { after } from "next/server";
import { sendEmail, type EmailMessage } from "@/server/email/transport";

/*
 * Email never holds up (or fails) the action that caused it: messages are
 * sent after the response with after(). Outside a request (scripts, tests)
 * they're sent right away without waiting; settleEmails() waits for those.
 */

const pending = new Set<Promise<void>>();

async function deliver(messages: EmailMessage[]) {
  for (const message of messages) {
    try {
      await sendEmail(message);
    } catch (error) {
      console.error(`Couldn't send email (${message.kind})`, error);
    }
  }
}

/** Queues messages (or a function producing them) to send after the response. */
export function sendInBackground(messages: EmailMessage[] | (() => Promise<EmailMessage[]>)): void {
  const run = async () => {
    try {
      await deliver(typeof messages === "function" ? await messages() : messages);
    } catch (error) {
      console.error("Couldn't prepare email", error);
    }
  };
  try {
    after(run);
  } catch {
    // Not inside a request: send now, without blocking the caller.
    const promise = run().finally(() => pending.delete(promise));
    pending.add(promise);
  }
}

/** Waits for emails started outside a request (tests and scripts). */
export async function settleEmails() {
  while (pending.size > 0) await Promise.all(pending);
}
