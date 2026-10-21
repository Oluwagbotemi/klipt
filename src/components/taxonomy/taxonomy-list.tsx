"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteTaxonomyAction,
  saveTaxonomyAction,
  type TaxonomyFormState,
} from "@/app/(site)/sites/[siteId]/taxonomy/actions";
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
import { Textarea } from "@/components/ui/textarea";
import type { CollectionType } from "@/lib/models";
import { keyFromLabel } from "@/lib/models";
import { siteHref } from "@/lib/navigation";
import { termPath, type TaxonomySummary } from "@/lib/taxonomy";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Structure › Taxonomy › Custom taxonomies: groupings beyond categories and tags. */
export function TaxonomyList({
  siteId,
  taxonomies,
  models,
  canManage,
}: {
  siteId: string;
  taxonomies: TaxonomySummary[];
  models: CollectionType[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<{ taxonomy?: TaxonomySummary } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [removing, setRemoving] = useState<TaxonomySummary | null>(null);
  const [pending, startTransition] = useTransition();
  const modelName = (key: string) => models.find((model) => model.key === key)?.name ?? key;

  function open(next: { taxonomy?: TaxonomySummary }) {
    setFormKey((n) => n + 1);
    setEditing(next);
  }

  function remove(event: React.MouseEvent) {
    event.preventDefault();
    if (!removing) return;
    startTransition(async () => {
      const result = await deleteTaxonomyAction(siteId, removing.id);
      if (result.ok) {
        toast.success(`Deleted ${removing.name}. Entries were kept.`);
        setRemoving(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-muted-foreground max-w-prose text-sm">
          Add your own ways of grouping content beyond categories and tags, such as Region,
          Ingredient or Product line, and choose which content types use each one.
        </p>
        {canManage && (
          <Button onClick={() => open({})}>
            <Plus aria-hidden /> New taxonomy
          </Button>
        )}
      </div>
      {!canManage && (
        <ReadOnlyNote>
          You can view custom taxonomies. Only owners and admins can add or change them.
        </ReadOnlyNote>
      )}

      {taxonomies.length === 0 ? (
        <section
          aria-labelledby="no-custom-taxonomies"
          className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-5"
        >
          <span className="bg-muted grid size-10 place-items-center rounded-xl" aria-hidden>
            <Layers className="text-muted-foreground size-5" />
          </span>
          <div>
            <h2 id="no-custom-taxonomies" className="text-base font-semibold">
              No custom taxonomies yet
            </h2>
            <p className="text-muted-foreground text-sm">
              Categories and Tags cover most sites. Add a custom taxonomy when you need another
              grouping with its own archive pages, e.g. {termPath("region", "europe")}.
            </p>
          </div>
          {canManage && (
            <Button variant="outline" onClick={() => open({})}>
              <Plus aria-hidden /> New taxonomy
            </Button>
          )}
        </section>
      ) : (
        <ul className="bg-card divide-y rounded-2xl border" aria-label="Custom taxonomies">
          {taxonomies.map((taxonomy) => (
            <li key={taxonomy.id} className="flex min-w-0 items-center gap-2 pr-2 sm:pr-3">
              <Link
                href={`${siteHref(siteId, "taxonomy", "custom")}/${taxonomy.key}`}
                className="hover:bg-accent/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-4 rounded-2xl px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{taxonomy.name}</span>
                    <code className="text-muted-foreground font-mono text-xs">{taxonomy.key}</code>
                    <Badge variant="outline">{taxonomy.hierarchical ? "Nested" : "Flat"}</Badge>
                  </span>
                  <span className="text-muted-foreground block text-sm break-words">
                    {taxonomy.modelKeys.length > 0
                      ? `Used by ${taxonomy.modelKeys.map(modelName).join(", ")}`
                      : "Not used by any content type yet"}
                    {" · "}
                    {count(taxonomy.termCount, "term", "terms")}
                  </span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </Link>
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${taxonomy.name}`}
                    onClick={() => open({ taxonomy })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${taxonomy.name}`}
                    onClick={() => setRemoving(taxonomy)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        {editing && (
          <TaxonomyForm
            key={formKey}
            siteId={siteId}
            taxonomy={editing.taxonomy}
            models={models}
            onSaved={() => setEditing(null)}
          />
        )}
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => !next && !pending && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Entries are kept. Its {count(removing?.termCount ?? 0, "term", "terms")} and their
            archive pages are removed, and entries no longer show them in the editor or the content
            API. This can&apos;t be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Delete taxonomy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TaxonomyForm({
  siteId,
  taxonomy,
  models,
  onSaved,
}: {
  siteId: string;
  taxonomy?: TaxonomySummary;
  models: CollectionType[];
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveTaxonomyAction, {
    values: {
      name: taxonomy?.name ?? "",
      key: taxonomy?.key ?? "",
      description: taxonomy?.description ?? "",
      hierarchical: taxonomy?.hierarchical ?? false,
      modelKeys: taxonomy?.modelKeys ?? ["post"],
    },
  } satisfies TaxonomyFormState);
  const [name, setName] = useState(state.values.name);
  const [key, setKey] = useState(state.values.key);
  const [keyEdited, setKeyEdited] = useState(Boolean(state.values.key));
  const shownKey = taxonomy ? taxonomy.key : keyEdited ? key : keyFromLabel(name, "-");

  useEffect(() => {
    if (!state.saved) return;
    toast.success(
      state.saved.created ? `Created ${state.saved.name}.` : `Saved ${state.saved.name}.`,
    );
    onSaved();
  }, [state, onSaved]);

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <form action={formAction} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{taxonomy ? `Edit ${taxonomy.name}` : "New taxonomy"}</DialogTitle>
          <DialogDescription>
            {taxonomy
              ? "The key and nesting are fixed once created."
              : "You can change everything except the key and nesting later."}
          </DialogDescription>
        </DialogHeader>
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <input type="hidden" name="siteId" value={siteId} />
        {taxonomy && <input type="hidden" name="taxonomyId" value={taxonomy.id} />}
        <FormField
          id="taxonomy-name"
          name="name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={state.errors?.name}
          hint="Plural, e.g. Regions."
          maxLength={60}
          required
          autoFocus
        />
        <FormField
          id="taxonomy-key"
          name="key"
          label="Key"
          value={shownKey}
          readOnly={Boolean(taxonomy)}
          onChange={(event) => {
            setKeyEdited(true);
            setKey(event.target.value.toLowerCase());
          }}
          error={state.errors?.key}
          hint={
            <>
              Used in the API (<code className="font-mono">?term={shownKey || "region"}:…</code>)
              and archive URLs like{" "}
              <code className="font-mono break-all">
                {termPath(shownKey || "region", "example")}
              </code>
              .
            </>
          }
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="taxonomy-description" className="text-sm font-medium">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            id="taxonomy-description"
            name="description"
            defaultValue={state.values.description}
            maxLength={200}
            rows={2}
          />
          {state.errors?.description && (
            <p className="text-destructive text-sm">{state.errors.description}</p>
          )}
        </div>
        <fieldset className="grid gap-2" disabled={Boolean(taxonomy)}>
          <legend className="mb-1 text-sm font-medium">Nesting</legend>
          {[
            { value: "no", label: "Flat, like tags", hint: "Each term stands on its own." },
            {
              value: "yes",
              label: "Nested, like categories",
              hint: "Terms can sit inside others, up to three levels.",
            },
          ].map((option) => (
            <label
              key={option.value}
              className="hover:bg-accent/50 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 has-focus-visible:ring-[3px] has-disabled:cursor-default has-disabled:opacity-70"
            >
              <input
                type="radio"
                name="hierarchical"
                value={option.value}
                defaultChecked={(state.values.hierarchical ? "yes" : "no") === option.value}
                className="accent-primary mt-1 size-4 shrink-0 outline-none"
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="text-muted-foreground block text-xs">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Used by</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {models.map((model) => (
              <label
                key={model.key}
                className="hover:bg-accent/50 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-focus-visible:ring-[3px]"
              >
                <input
                  type="checkbox"
                  name="modelKeys"
                  value={model.key}
                  defaultChecked={state.values.modelKeys.includes(model.key)}
                  className="accent-primary size-4 shrink-0 outline-none"
                />
                <span className="min-w-0 truncate text-sm">{model.name}</span>
              </label>
            ))}
          </div>
          {state.errors?.modelKeys ? (
            <p className="text-destructive text-sm">{state.errors.modelKeys}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Entries of these types show it in the editor&apos;s “Categories &amp; tags” panel.
            </p>
          )}
        </fieldset>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Saving…" : taxonomy ? "Save changes" : "Create taxonomy"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
