"use client";

import { useActionState, useState } from "react";
import { Loader2, MailCheck, MailWarning } from "lucide-react";
import { toast } from "sonner";
import {
  saveNotificationsAction,
  type AccountFormState,
  type NotificationValues,
} from "@/app/(account)/account/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";

/** Whether the sign-in email is confirmed, with a way to send the link again. */
export function EmailStatus({ email, verified }: { email: string; verified: boolean }) {
  const [sending, setSending] = useState(false);

  if (verified) {
    return (
      <p className="text-success flex items-center gap-2 text-sm">
        <MailCheck className="size-4 shrink-0" aria-hidden />
        Your email is confirmed.
      </p>
    );
  }

  async function resend() {
    setSending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/email-verified",
    });
    setSending(false);
    if (error) {
      toast.error(
        error.status === 429
          ? "Too many emails sent. Wait a minute and try again."
          : "Couldn't send the email. Try again in a moment.",
      );
    } else {
      toast.success(`We sent a confirmation link to ${email}.`);
    }
  }

  return (
    <div
      role="status"
      className="bg-warning-soft text-warning flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl px-4 py-3 text-sm"
    >
      <div className="flex min-w-0 flex-1 basis-56 gap-2">
        <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-medium">Confirm your email.</span> We sent a link to{" "}
          <span className="break-all">{email}</span>. Until you confirm it, you can still sign in
          and work as usual.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={resend} disabled={sending}>
        {sending && <Loader2 className="animate-spin" aria-hidden />}
        {sending ? "Sending…" : "Send link again"}
      </Button>
    </div>
  );
}

/** The one notification setting: assignment and review emails. */
export function NotificationsForm({ assignments }: { assignments: boolean }) {
  const [state, formAction, pending] = useActionState(saveNotificationsAction, {
    values: { assignments },
  } satisfies AccountFormState<NotificationValues>);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Switch
          id="notify-assignments"
          name="assignments"
          defaultChecked={state.values.assignments}
          aria-describedby="notify-assignments-hint"
          className="mt-0.5"
        />
        <div>
          <label htmlFor="notify-assignments" className="text-sm font-medium">
            Assignments and reviews
          </label>
          <p id="notify-assignments-hint" className="text-muted-foreground text-xs">
            When someone assigns you an entry, asks you for a review, requests changes or approves
            your work.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Invitations, password resets, email confirmations and ownership transfers are always sent,
        since they keep your account secure.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save"}
        </Button>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {state.saved && !pending ? "Saved." : ""}
        </p>
      </div>
    </form>
  );
}
