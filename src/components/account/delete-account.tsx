"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, Loader2, Trash2, UserX } from "lucide-react";
import { deleteAccountAction } from "@/app/(account)/account/actions";
import { InlineAlert } from "@/components/inline-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { OwnedSite } from "@/lib/account";
import { siteHref } from "@/lib/navigation";

function OwnedSitesList({ sites }: { sites: OwnedSite[] }) {
  return (
    <ul
      className="border-card-border divide-card-border divide-y rounded-(--radius-nested) border"
      aria-label="Sites you own"
    >
      {sites.map((site) => (
        <li key={site.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <p className="flex min-w-0 flex-1 basis-40 items-center gap-2 text-sm font-medium">
            <span className="truncate">{site.name}</span>
            {site.archived && (
              <Badge variant="outline">
                <Archive aria-hidden /> Archived
              </Badge>
            )}
          </p>
          {site.archived ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/sites#archived-heading">Restore or delete</Link>
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={siteHref(site.id, "settings", "ownership")}>Transfer</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={siteHref(site.id, "settings", "danger")}>Delete site</Link>
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Permanently delete the account; blocked while the user owns any site. */
export function DeleteAccount({ email, ownedSites }: { email: string; ownedSites: OwnedSite[] }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<OwnedSite[] | null>(null);
  const [pending, startTransition] = useTransition();
  const owned = blockedBy ?? ownedSites;

  function show() {
    setPassword("");
    setConfirmEmail("");
    setError(null);
    setOpen(true);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmEmail, password });
      if (result && !result.ok) {
        if (result.ownedSites) {
          setBlockedBy(result.ownedSites);
          setOpen(false);
        } else setError(result.error);
      }
    });
  }

  if (owned.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          You own {owned.length === 1 ? "1 site" : `${owned.length} sites`}. Transfer each one to
          someone else or delete it first, so nobody loses a site along with your account.
        </p>
        <OwnedSitesList sites={owned} />
      </div>
    );
  }

  const canDelete =
    confirmEmail.trim().toLowerCase() === email.toLowerCase() && password.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground max-w-prose text-sm">
          You&apos;ll leave every site you&apos;re a member of. Content and media you created stay
          on those sites without your name. This can&apos;t be undone.
        </p>
        <Button variant="destructive" onClick={show}>
          <Trash2 aria-hidden />
          Delete account
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent size="md">
          <DialogForm onSubmit={submit}>
            <DialogHeader icon={UserX} tone="destructive">
              <DialogTitle>Delete your account permanently?</DialogTitle>
              <DialogDescription>
                You&apos;ll be signed out everywhere and removed from all sites. To come back,
                you&apos;d create a new account and be invited again.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {error && <InlineAlert>{error}</InlineAlert>}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm-email" className="text-sm font-medium">
                  Type <span className="font-mono break-all">{email}</span> to confirm
                </label>
                <Input
                  id="confirm-email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="delete-password" className="text-sm font-medium">
                  Your password
                </label>
                <Input
                  id="delete-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={pending || !canDelete}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Delete account
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
