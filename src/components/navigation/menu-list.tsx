"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, ListTree, Loader2, Plus, Trash2 } from "lucide-react";
import {
  createMenuAction,
  deleteMenuAction,
  type NewMenuState,
} from "@/app/(site)/sites/[siteId]/navigation/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { ReadOnlyNote } from "@/components/models/model-form-parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { formatDateTime } from "@/lib/format";
import { MAX_CUSTOM_MENUS, type MenuSummary } from "@/lib/menus";
import { keyFromLabel } from "@/lib/models";
import { siteHref } from "@/lib/navigation";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Navigation: the site's header, footer and custom menus. */
export function MenuList({
  siteId,
  menus,
  canManage,
}: {
  siteId: string;
  menus: MenuSummary[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<MenuSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const system = menus.filter((menu) => menu.isSystem);
  const custom = menus.filter((menu) => !menu.isSystem);
  const atLimit = custom.length >= MAX_CUSTOM_MENUS;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-muted-foreground max-w-prose text-sm">
          Menus are the links in your website&apos;s header, footer and anywhere else it shows
          navigation. Your website reads them from the content API, so changes go live as soon as
          you save.
        </p>
        {canManage && (
          <Button onClick={() => setCreating(true)} disabled={atLimit}>
            <Plus aria-hidden /> New menu
          </Button>
        )}
      </div>

      {!canManage && (
        <ReadOnlyNote>
          You can view menus. Only owners, admins and editors can change them.
        </ReadOnlyNote>
      )}
      {deleteError && <InlineAlert>{deleteError}</InlineAlert>}

      <MenuGroup title="Site menus" siteId={siteId} menus={system} />

      {custom.length > 0 ? (
        <MenuGroup
          title="Custom menus"
          siteId={siteId}
          menus={custom}
          onDelete={canManage ? setDeleting : undefined}
          busy={pending}
        />
      ) : (
        <section
          aria-labelledby="custom-menus-empty"
          className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-5"
        >
          <span className="bg-muted grid size-10 place-items-center rounded-xl" aria-hidden>
            <ListTree className="text-muted-foreground size-5" />
          </span>
          <div>
            <h2 id="custom-menus-empty" className="text-base font-semibold">
              No custom menus yet
            </h2>
            <p className="text-muted-foreground text-sm">
              Add one for other link lists, such as a sidebar, legal links or social profiles.
            </p>
          </div>
          {canManage && (
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus aria-hidden /> New menu
            </Button>
          )}
        </section>
      )}
      {canManage && atLimit && (
        <p className="text-muted-foreground text-xs">
          A site can have up to {MAX_CUSTOM_MENUS} custom menus.
        </p>
      )}

      {canManage && (
        <Dialog open={creating} onOpenChange={setCreating}>
          {creating && <NewMenuDialog siteId={siteId} />}
        </Dialog>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete the “{deleting?.name}” menu?</AlertDialogTitle>
          <AlertDialogDescription>
            This can&apos;t be undone. Its {count(deleting?.itemCount ?? 0, "link", "links")} are
            removed, and websites asking the content API for{" "}
            <code className="font-mono">{deleting?.key}</code> get a not-found error.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const menu = deleting;
                if (!menu) return;
                startTransition(async () => {
                  setDeleteError(null);
                  const result = await deleteMenuAction(siteId, menu.key);
                  if (result?.error) setDeleteError(result.error);
                });
              }}
            >
              Delete menu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MenuGroup({
  title,
  siteId,
  menus,
  onDelete,
  busy,
}: {
  title: string;
  siteId: string;
  menus: MenuSummary[];
  onDelete?: (menu: MenuSummary) => void;
  busy?: boolean;
}) {
  const id = `menus-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h2>
      <ul className="bg-card divide-y rounded-2xl border">
        {menus.map((menu) => (
          <li key={menu.id} className="flex items-center first:rounded-t-2xl last:rounded-b-2xl">
            <Link
              href={`${siteHref(siteId, "navigation")}/${menu.key}`}
              className="hover:bg-accent/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-4 px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-5"
            >
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <ListTree className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium break-words">{menu.name}</span>
                  <code className="text-muted-foreground font-mono text-xs">{menu.key}</code>
                  {menu.warningCount > 0 && (
                    <Badge variant="warning">
                      <AlertTriangle aria-hidden />
                      {count(menu.warningCount, "hidden link", "hidden links")}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground block truncate text-sm">
                  {menu.itemCount === 0
                    ? "Empty"
                    : `${count(menu.itemCount, "link", "links")} · saved ${formatDateTime(menu.updatedAt)}`}
                </span>
              </span>
              <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
            {onDelete && (
              <div className="pr-2 sm:pr-3">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => onDelete(menu)}
                  aria-label={`Delete ${menu.name} menu`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewMenuDialog({ siteId }: { siteId: string }) {
  const [state, formAction, pending] = useActionState(createMenuAction, {
    values: { name: "", key: "" },
  } satisfies NewMenuState);
  const [name, setName] = useState(state.values.name);
  const [key, setKey] = useState(state.values.key);
  const [keyEdited, setKeyEdited] = useState(Boolean(state.values.key));
  const shownKey = keyEdited ? key : keyFromLabel(name, "-");

  return (
    <DialogContent>
      <form action={formAction} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>New menu</DialogTitle>
          <DialogDescription>
            Name it, then add links on the next screen. The key can&apos;t change later.
          </DialogDescription>
        </DialogHeader>
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <input type="hidden" name="siteId" value={siteId} />
        <FormField
          id="menu-name"
          name="name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={state.errors?.name}
          hint="For people in Klipt, e.g. Legal links."
          maxLength={60}
          required
          autoFocus
        />
        <FormField
          id="menu-key"
          name="key"
          label="Key"
          value={shownKey}
          onChange={(event) => {
            setKeyEdited(true);
            setKey(event.target.value.toLowerCase());
          }}
          error={state.errors?.key}
          hint={
            <>
              Your website asks for it by this key:{" "}
              <code className="font-mono break-all">/api/v1/menus/{shownKey || "legal"}</code>
            </>
          }
          className="[&_input]:font-mono"
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Creating…" : "Create menu"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
