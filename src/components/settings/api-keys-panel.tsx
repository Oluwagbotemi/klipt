"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, Loader2, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  type CreateApiKeyState,
} from "@/app/(site)/sites/[siteId]/settings/integrations/actions";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApiKeySummary } from "@/lib/api-keys";
import { formatDate } from "@/lib/format";

/** Lists a site's API keys, with create (key shown once) and revoke. */
export function ApiKeysPanel({ siteId, keys }: { siteId: string; keys: ApiKeySummary[] }) {
  const [creating, setCreating] = useState(false);
  // A new form (and fresh action state) each time the dialog opens.
  const [formKey, setFormKey] = useState(0);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);

  function openCreate() {
    setFormKey((n) => n + 1);
    setCreating(true);
  }

  return (
    <section aria-labelledby="keys-heading" className="bg-card rounded-2xl border">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 id="keys-heading" className="text-base font-semibold">
            API keys
          </h2>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            Read-only. A key can read this site&apos;s published content and nothing else. Use a
            separate key for each website so you can revoke one without affecting the others.
          </p>
        </div>
        {keys.length > 0 && (
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            Create API key
          </Button>
        )}
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center border-t px-5 py-10 text-center">
          <span
            aria-hidden
            className="bg-muted text-muted-foreground mb-3 grid size-10 place-items-center rounded-xl"
          >
            <KeyRound className="size-5" />
          </span>
          <p className="font-medium">No API keys yet</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Create a key to let your website fetch published content from this site.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus aria-hidden />
            Create API key
          </Button>
        </div>
      ) : (
        <ul className="divide-y border-t" aria-label="API keys">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 sm:px-6"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <p className="text-muted-foreground font-mono text-xs">{key.prefix}…</p>
              </div>
              <p className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span>
                  Created {formatDate(key.createdAt)}
                  {key.createdByName && ` by ${key.createdByName}`}
                </span>
                <span>
                  {key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used"}
                </span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive ml-auto"
                aria-label={`Revoke ${key.name}`}
                onClick={() => setRevoking(key)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <CreateKeyDialog key={formKey} siteId={siteId} />
      </Dialog>
      <RevokeKeyDialog siteId={siteId} apiKey={revoking} onClose={() => setRevoking(null)} />
    </section>
  );
}

const initialState: CreateApiKeyState = { values: { name: "" } };

function CreateKeyDialog({ siteId }: { siteId: string }) {
  const [state, formAction, pending] = useActionState(createApiKeyAction, initialState);
  const created = state.created;

  return (
    <DialogContent
      // Once the key is showing, only "Done" or Escape closes it, so it isn't lost by a stray click.
      onInteractOutside={(event) => created && event.preventDefault()}
    >
      {created ? (
        <>
          <DialogHeader>
            <DialogTitle>Copy your new API key</DialogTitle>
            <DialogDescription>
              {created.name}. Save it somewhere safe, such as your website&apos;s environment
              variables.
            </DialogDescription>
          </DialogHeader>
          <div
            role="note"
            className="bg-warning-soft text-warning flex gap-2 rounded-lg px-3 py-2.5 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>For your security, Klipt won&apos;t show this key again.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-api-key" className="text-sm font-medium">
              API key
            </label>
            <input
              id="new-api-key"
              readOnly
              value={created.token}
              onFocus={(event) => event.currentTarget.select()}
              className="border-input bg-muted focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 font-mono text-sm outline-none focus-visible:ring-[3px]"
            />
          </div>
          <DialogFooter>
            <CopyButton value={created.token} label="Copy key" variant="outline" />
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </>
      ) : (
        <form action={formAction} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              The key can read this site&apos;s published content. You&apos;ll see it once, right
              after you create it.
            </DialogDescription>
          </DialogHeader>
          {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
          <input type="hidden" name="siteId" value={siteId} />
          <FormField
            id="api-key-name"
            name="name"
            label="Name"
            defaultValue={state.values.name}
            error={state.errors?.name}
            hint="Which website or app will use it, e.g. Blog website."
            maxLength={60}
            autoComplete="off"
            required
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {pending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}

function RevokeKeyDialog({
  siteId,
  apiKey,
  onClose,
}: {
  siteId: string;
  apiKey: ApiKeySummary | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function revoke(event: React.MouseEvent) {
    event.preventDefault();
    if (!apiKey) return;
    startTransition(async () => {
      const result = await revokeApiKeyAction(siteId, apiKey.id);
      if (result.ok) {
        toast.success(`Revoked ${apiKey.name}.`);
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={apiKey !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogTitle>Revoke {apiKey?.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          Websites using this key stop receiving content right away. This can&apos;t be undone, but
          you can create a new key at any time.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revoke} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Revoking…" : "Revoke key"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
