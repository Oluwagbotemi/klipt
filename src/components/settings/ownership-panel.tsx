"use client";

import { useActionState, useState, useTransition } from "react";
import { Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  cancelTransferAction,
  renewTransferLinkAction,
  startTransferAction,
  transferLinkAction,
  type FormState,
  type TransferValues,
} from "@/app/(site)/sites/[siteId]/settings/actions";
import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { OwnershipState } from "@/lib/site-settings";

type StartState = FormState<TransferValues> & { url?: string };

/** Start, share, renew or cancel an ownership transfer. Only owners see this. */
export function OwnershipPanel({
  siteId,
  siteName,
  pending,
  members,
}: {
  siteId: string;
  siteName: string;
  pending: OwnershipState["pending"];
  members: { email: string; name: string }[];
}) {
  const [state, formAction, submitting] = useActionState(startTransferAction, {
    values: { email: "", retainAdmin: true },
  } satisfies StartState);
  const [busy, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function copy(url: string, message: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(message);
    } catch {
      toast.message("Copy this link", { description: url });
    }
  }

  if (pending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-warning-soft text-warning rounded-xl px-4 py-3 text-sm" role="status">
          <p className="font-medium">Transfer pending to {pending.recipientEmail}</p>
          <p className="mt-0.5">
            Nothing changes until they accept. Link expires {formatDate(pending.expiresAt)}. You
            {pending.previousOwnerRetainsAdmin ? " stay on as Admin" : " leave the site"} after they
            accept.
          </p>
        </div>
        {state.url && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="transfer-link" className="text-sm font-medium">
              Transfer link
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="transfer-link"
                readOnly
                value={state.url}
                onFocus={(e) => e.currentTarget.select()}
                className="border-input bg-muted h-10 min-w-0 flex-1 basis-full rounded-lg border px-3 font-mono text-xs outline-none sm:basis-0"
              />
              <CopyButton value={state.url} label="Copy link" />
            </div>
            <p className="text-muted-foreground text-xs">
              Send this to {pending.recipientEmail}. Klipt doesn&apos;t send emails yet.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {pending.linkAvailable && !state.url && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  const result = await transferLinkAction(siteId);
                  if (result.ok) void copy(result.url, "Transfer link copied.");
                  else toast.error(result.error);
                })
              }
            >
              <Link2 aria-hidden />
              Copy link
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const result = await renewTransferLinkAction(siteId);
                if (result.ok)
                  void copy(result.url, "New link copied. The old link no longer works.");
                else toast.error(result.error);
              })
            }
          >
            <RefreshCw aria-hidden />
            New link
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmCancel(true)}
          >
            Cancel transfer
          </Button>
        </div>
        <AlertDialog open={confirmCancel} onOpenChange={(open) => !busy && setConfirmCancel(open)}>
          <AlertDialogContent>
            <AlertDialogTitle>Cancel the transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              The link stops working and you stay the owner of {siteName}.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  startTransition(async () => {
                    const result = await cancelTransferAction(siteId);
                    if (result.ok) {
                      toast.success("Transfer cancelled.");
                      setConfirmCancel(false);
                    } else toast.error(result.error);
                  });
                }}
              >
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Cancel transfer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <input type="hidden" name="siteId" value={siteId} />
      <FormField
        id="transfer-email"
        name="email"
        type="email"
        label="New owner's email"
        defaultValue={state.values.email}
        error={state.errors?.email}
        hint="They accept by signing in (or creating an account) with this email."
        list="transfer-members"
        autoComplete="off"
        required
      />
      <datalist id="transfer-members">
        {members.map((member) => (
          <option key={member.email} value={member.email}>
            {member.name}
          </option>
        ))}
      </datalist>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="retainAdmin"
          defaultChecked={state.values.retainAdmin}
          className="accent-primary mt-0.5 size-4 shrink-0"
        />
        <span>
          <span className="block font-medium">Keep me on the site as Admin</span>
          <span className="text-muted-foreground block">
            Untick to leave the site completely once the transfer is accepted, e.g. when handing a
            finished site to a client.
          </span>
        </span>
      </label>
      <FormField
        id="transfer-password"
        name="password"
        type="password"
        label="Your password"
        error={state.errors?.password}
        hint="To confirm it's you."
        autoComplete="current-password"
        required
      />
      <div>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" aria-hidden />}
          {submitting ? "Creating link…" : "Start transfer"}
        </Button>
      </div>
    </form>
  );
}
