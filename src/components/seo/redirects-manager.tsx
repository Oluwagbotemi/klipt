"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ArrowRightLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteRedirectsAction,
  saveRedirectAction,
  type RedirectFormState,
} from "@/app/(site)/sites/[siteId]/seo/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { InfoChip } from "@/components/visual/info-chip";
import { formatDate } from "@/lib/format";
import { siteHref } from "@/lib/navigation";
import { REDIRECT_CODES, type RedirectRow } from "@/lib/seo";

type Editing = { redirect?: RedirectRow; from?: string } | null;

export function RedirectsManager({
  siteId,
  redirects,
  canManage,
  prefillFrom,
}: {
  siteId: string;
  redirects: RedirectRow[];
  canManage: boolean;
  prefillFrom: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editing, setEditing] = useState<Editing>(
    canManage && prefillFrom ? { from: prefillFrom } : null,
  );
  const [formKey, setFormKey] = useState(0);
  const [removing, setRemoving] = useState<RedirectRow | null>(null);
  const [pending, startTransition] = useTransition();

  function open(next: Editing) {
    setFormKey((n) => n + 1);
    setEditing(next);
  }
  function close() {
    setEditing(null);
    if (prefillFrom) router.replace(pathname, { scroll: false });
  }

  function remove(event: React.MouseEvent) {
    event.preventDefault();
    if (!removing) return;
    startTransition(async () => {
      const result = await deleteRedirectsAction(siteId, [removing.id]);
      if (result.ok) {
        toast.success(`Deleted the redirect from ${removing.from}.`);
        setRemoving(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      {canManage && (
        <div>
          <Button onClick={() => open({})}>
            <Plus aria-hidden />
            Add redirect
          </Button>
        </div>
      )}
      {redirects.length === 0 ? null : (
        <ul
          className="visual-card divide-card-border divide-y overflow-hidden"
          aria-label="Redirects"
        >
          {redirects.map((redirect) => (
            <li
              key={redirect.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0 flex-1 basis-72">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-sm">
                  <span className="min-w-0 break-all">{redirect.from}</span>
                  <ArrowRight className="text-muted-foreground size-3.5 shrink-0" aria-label="to" />
                  <span className="min-w-0 break-all">{redirect.to}</span>
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {redirect.entry ? (
                    <>
                      Added when the URL of{" "}
                      <Link
                        href={`${siteHref(siteId, "content")}/${redirect.entry.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {redirect.entry.title}
                      </Link>{" "}
                      changed
                    </>
                  ) : (
                    <>Added{redirect.createdByName ? ` by ${redirect.createdByName}` : ""}</>
                  )}{" "}
                  · {formatDate(redirect.updatedAt)}
                </p>
              </div>
              <InfoChip tone={redirect.statusCode === 301 ? "accent" : "neutral"}>
                {redirect.statusCode === 301 ? "301 Permanent" : "302 Temporary"}
              </InfoChip>
              {canManage && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit redirect from ${redirect.from}`}
                    onClick={() => open({ redirect })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete redirect from ${redirect.from}`}
                    onClick={() => setRemoving(redirect)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(next) => !next && close()}>
        {editing && (
          <RedirectForm
            key={formKey}
            siteId={siteId}
            redirect={editing.redirect}
            from={editing.from}
            onSaved={close}
          />
        )}
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => !next && !pending && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader icon={Trash2} tone="destructive">
            <AlertDialogTitle>Delete this redirect?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Visitors and search engines following links to {removing?.from} will get a “not found”
              page instead of {removing?.to}. Old links and search results may still point there.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Delete redirect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RedirectForm({
  siteId,
  redirect,
  from,
  onSaved,
}: {
  siteId: string;
  redirect?: RedirectRow;
  from?: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveRedirectAction, {
    values: {
      from: redirect?.from ?? from ?? "",
      to: redirect?.to ?? "",
      statusCode: String(redirect?.statusCode ?? 301),
    },
  } satisfies RedirectFormState);

  useEffect(() => {
    if (!state.saved) return;
    toast.success(
      `${state.saved.from} now redirects to ${state.saved.to}.${
        state.saved.repointed
          ? ` ${state.saved.repointed} older ${state.saved.repointed === 1 ? "redirect was" : "redirects were"} updated to go straight there.`
          : ""
      }`,
    );
    onSaved();
  }, [state, onSaved]);

  return (
    <DialogContent size="md">
      <DialogForm action={formAction}>
        <DialogHeader icon={ArrowRightLeft}>
          <DialogTitle>{redirect ? "Edit redirect" : "Add redirect"}</DialogTitle>
          <DialogDescription>
            Send visitors and search engines from an old address to a new one.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
          <input type="hidden" name="siteId" value={siteId} />
          {redirect && <input type="hidden" name="redirectId" value={redirect.id} />}
          <FormField
            id="redirect-from"
            name="from"
            label="From (old address)"
            defaultValue={state.values.from}
            error={state.errors?.from}
            hint="A path on your site, e.g. /old-page or /posts/old-title."
            autoComplete="off"
            spellCheck={false}
            required
            autoFocus={!from}
          />
          <FormField
            id="redirect-to"
            name="to"
            label="To (new address)"
            defaultValue={state.values.to}
            error={state.errors?.to}
            hint="A path such as /new-page, or a full address on another site."
            autoComplete="off"
            spellCheck={false}
            required
            autoFocus={Boolean(from)}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Type</legend>
            {Object.entries(REDIRECT_CODES).map(([code, label]) => (
              <label
                key={code}
                className="hover:bg-accent/50 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 has-focus-visible:ring-[3px]"
              >
                <input
                  type="radio"
                  name="statusCode"
                  value={code}
                  defaultChecked={state.values.statusCode === code}
                  className="accent-primary mt-1 size-4 shrink-0 outline-none"
                />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="text-muted-foreground block text-xs">
                    {code === "301"
                      ? "The page has moved for good. Search engines move their listing to the new address. Use this in most cases."
                      : "The move is temporary. Search engines keep the old address listed."}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Saving…" : redirect ? "Save changes" : "Add redirect"}
          </Button>
        </DialogFooter>
      </DialogForm>
    </DialogContent>
  );
}
