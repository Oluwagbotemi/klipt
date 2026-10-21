"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { inviteMemberAction, type InviteState } from "@/app/(site)/sites/[siteId]/team/actions";
import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_DESCRIPTIONS, type InvitableRole } from "@/lib/team";
import { ROLE_LABELS } from "@/lib/types";

/** Invite form; after creating it, says it was emailed and shows the link to share too. */
export function InviteDialog({
  siteId,
  siteName,
  roles,
  emailEnabled,
  onInviteAnother,
}: {
  siteId: string;
  siteName: string;
  roles: InvitableRole[];
  emailEnabled: boolean;
  onInviteAnother: () => void;
}) {
  const [state, formAction, pending] = useActionState(inviteMemberAction, {
    values: { email: "", role: roles.includes("editor") ? "editor" : roles[0] },
  } satisfies InviteState);

  if (state.invite) {
    const { invite } = state;
    return (
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {invite.emailed ? "Invitation sent" : "Share the invitation link"}
          </DialogTitle>
          <DialogDescription>
            {invite.emailed ? (
              <>We emailed {invite.email}. You can also copy the link and send it yourself.</>
            ) : (
              <>Send this link to {invite.email} by email, chat or anything you like.</>
            )}{" "}
            They&apos;ll join {siteName} as {ROLE_LABELS[invite.role]} after signing in with that
            email.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-link" className="text-sm font-medium">
            Invitation link
          </label>
          <input
            id="invite-link"
            readOnly
            value={invite.url}
            onFocus={(event) => event.currentTarget.select()}
            className="border-input bg-muted h-10 w-full rounded-lg border px-3 font-mono text-xs outline-none"
          />
          <p className="text-muted-foreground text-xs">
            Works once and expires in {invite.days} days. You can copy it again or cancel it under
            Pending invitations.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onInviteAnother}>
            Invite someone else
          </Button>
          <CopyButton value={invite.url} label="Copy link" variant="default" />
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent>
      <form action={formAction} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            {emailEnabled
              ? "We'll email them a link to join. You'll also get the link to share yourself."
              : "You'll get a link to send them. Email isn't set up for this Klipt yet."}
          </DialogDescription>
        </DialogHeader>
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <input type="hidden" name="siteId" value={siteId} />
        <FormField
          id="invite-email"
          name="email"
          type="email"
          label="Email"
          defaultValue={state.values.email}
          error={state.errors?.email}
          hint="They must sign in (or create an account) with this email to accept."
          autoComplete="off"
          required
          autoFocus
        />
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Role</legend>
          {roles.map((role) => (
            <label
              key={role}
              className="hover:bg-accent/50 has-focus-visible:ring-ring/50 has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 has-focus-visible:ring-[3px]"
            >
              <input
                type="radio"
                name="role"
                value={role}
                defaultChecked={state.values.role === role}
                className="accent-primary mt-1 size-4 shrink-0 outline-none"
              />
              <span>
                <span className="block text-sm font-medium">{ROLE_LABELS[role]}</span>
                <span className="text-muted-foreground block text-xs">
                  {ROLE_DESCRIPTIONS[role]}
                </span>
              </span>
            </label>
          ))}
          {state.errors?.role && <p className="text-destructive text-sm">{state.errors.role}</p>}
        </fieldset>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Creating link…" : "Create invitation"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
