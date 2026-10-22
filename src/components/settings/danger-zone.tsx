"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2, Trash2 } from "lucide-react";
import { archiveSiteAction, deleteSiteAction } from "@/app/(site)/sites/[siteId]/settings/actions";
import { InlineAlert } from "@/components/inline-alert";
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

/** Archive or permanently delete the site, each confirmed with the owner's password. */
export function DangerZone({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [open, setOpen] = useState<"archive" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();

  function show(kind: "archive" | "delete") {
    setError(null);
    setPassword("");
    setConfirmName("");
    setOpen(kind);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        open === "archive"
          ? await archiveSiteAction(siteId, password)
          : await deleteSiteAction(siteId, { confirmName, password });
      if (result && !result.ok) setError(result.error);
    });
  }

  const canDelete = confirmName.trim() === siteName && password.length > 0;

  return (
    <>
      <ul className="divide-y">
        <li className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0">
          <div className="max-w-prose">
            <p className="text-sm font-medium">Archive this site</p>
            <p className="text-muted-foreground text-sm">
              Hides it from everyone, stops its API keys and webhooks, and keeps all content. You
              can restore it from the Sites page.
            </p>
          </div>
          <Button variant="outline" onClick={() => show("archive")}>
            <Archive aria-hidden />
            Archive site
          </Button>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-4 py-4 last:pb-0">
          <div className="max-w-prose">
            <p className="text-sm font-medium">Delete this site</p>
            <p className="text-muted-foreground text-sm">
              Permanently removes the site, its content, media files, members, API keys and
              webhooks. This can&apos;t be undone.
            </p>
          </div>
          <Button variant="destructive" onClick={() => show("delete")}>
            <Trash2 aria-hidden />
            Delete site
          </Button>
        </li>
      </ul>

      <Dialog open={open !== null} onOpenChange={(next) => !pending && !next && setOpen(null)}>
        <DialogContent size="md">
          <DialogForm onSubmit={submit}>
            <DialogHeader icon={open === "archive" ? Archive : Trash2} tone="destructive">
              <DialogTitle>
                {open === "archive" ? `Archive ${siteName}?` : `Delete ${siteName} permanently?`}
              </DialogTitle>
              <DialogDescription>
                {open === "archive"
                  ? "Everyone loses access until you restore it. Your website stops receiving content because its API keys stop working."
                  : "Everything in this site is deleted for good, including published content your website shows. Consider archiving instead."}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {error && <InlineAlert>{error}</InlineAlert>}
              {open === "delete" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm-name" className="text-sm font-medium">
                    Type <span className="font-mono">{siteName}</span> to confirm
                  </label>
                  <Input
                    id="confirm-name"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="danger-password" className="text-sm font-medium">
                  Your password
                </label>
                <Input
                  id="danger-password"
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
              <Button
                type="submit"
                variant={open === "delete" ? "destructive" : "default"}
                disabled={pending || (open === "delete" ? !canDelete : !password)}
              >
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {open === "archive" ? "Archive site" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
