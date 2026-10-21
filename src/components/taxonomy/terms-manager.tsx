"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CornerDownRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteTermAction,
  saveTermAction,
  type TermFormState,
} from "@/app/(site)/sites/[siteId]/taxonomy/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { selectClass } from "@/components/models/model-form-parts";
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
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/content";
import {
  descendantIds,
  flattenTree,
  matchesTerm,
  MAX_TERM_DEPTH,
  termPath,
  type TaxonomySummary,
  type TermSummary,
} from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type Row = TermSummary & { depth: number };

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

/** One noun for buttons and messages: "category", "tag", or "term" for custom taxonomies. */
function termNoun(taxonomy: TaxonomySummary) {
  if (taxonomy.key === "category") return { one: "category", many: "categories" };
  if (taxonomy.key === "tag") return { one: "tag", many: "tags" };
  return { one: "term", many: "terms" };
}

export function TermsManager({
  siteId,
  taxonomy,
  terms,
  query,
  canManage,
  contentHref,
}: {
  siteId: string;
  taxonomy: TaxonomySummary;
  terms: TermSummary[];
  /** Lower-cased search; when set, matching terms are listed flat with their parents. */
  query: string;
  canManage: boolean;
  contentHref: string;
}) {
  const noun = termNoun(taxonomy);
  const tree = useMemo(() => flattenTree(terms), [terms]);
  const byId = useMemo(() => new Map(terms.map((term) => [term.id, term])), [terms]);
  const rows: Row[] = query
    ? tree.filter((term) => matchesTerm(term, query)).map((term) => ({ ...term, depth: 0 }))
    : tree;

  const [editing, setEditing] = useState<{ term?: TermSummary; parentId?: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [removing, setRemoving] = useState<TermSummary | null>(null);
  const [pending, startTransition] = useTransition();

  function open(next: { term?: TermSummary; parentId?: string }) {
    setFormKey((n) => n + 1);
    setEditing(next);
  }

  function ancestry(term: TermSummary) {
    const names: string[] = [];
    for (let p = byId.get(term.parentId ?? ""); p && names.length < MAX_TERM_DEPTH;) {
      names.unshift(p.name);
      p = byId.get(p.parentId ?? "");
    }
    return names;
  }

  function remove(event: React.MouseEvent) {
    event.preventDefault();
    if (!removing) return;
    startTransition(async () => {
      const result = await deleteTermAction(siteId, removing.id);
      if (result.ok) {
        toast.success(`Deleted “${removing.name}”. Its entries were kept.`);
        setRemoving(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  const removingChildren = removing ? terms.filter((t) => t.parentId === removing.id).length : 0;

  return (
    <>
      {canManage && (
        <div>
          <Button onClick={() => open({})}>
            <Plus aria-hidden />
            Add {noun.one}
          </Button>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="bg-card divide-y rounded-2xl border" aria-label={taxonomy.name}>
          {rows.map((term) => {
            const parents = query ? ancestry(term) : [];
            return (
              <li
                key={term.id}
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
              >
                <div
                  className="flex min-w-0 flex-1 basis-60 items-start gap-2"
                  style={{ paddingInlineStart: `${term.depth * 1.5}rem` }}
                >
                  {term.depth > 0 && (
                    <CornerDownRight
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {parents.length > 0 && (
                        <span className="text-muted-foreground font-normal">
                          {parents.join(" › ")} ›{" "}
                        </span>
                      )}
                      {term.name}
                      {term.depth > 0 && (
                        <span className="sr-only">
                          {" "}
                          (inside {byId.get(term.parentId ?? "")?.name})
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs break-all">
                      {termPath(taxonomy.key, term.slug)}
                    </p>
                    {term.description && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                        {term.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {term.entryCount > 0 ? (
                    <Link
                      href={`${contentHref}?term=${taxonomy.key}:${term.slug}`}
                      className="text-primary mr-2 text-sm underline-offset-4 hover:underline"
                    >
                      {entries(term.entryCount)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground mr-2 text-sm">No entries</span>
                  )}
                  {canManage && (
                    <>
                      {taxonomy.hierarchical && term.depth < MAX_TERM_DEPTH - 1 && !query && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Add ${noun.one} inside ${term.name}`}
                          title={`Add inside ${term.name}`}
                          onClick={() => open({ parentId: term.id })}
                        >
                          <Plus aria-hidden />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${term.name}`}
                        onClick={() => open({ term })}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${term.name}`}
                        onClick={() => setRemoving(term)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        {editing && (
          <TermForm
            key={formKey}
            siteId={siteId}
            taxonomy={taxonomy}
            tree={tree}
            term={editing.term}
            parentId={editing.parentId}
            onSaved={() => setEditing(null)}
          />
        )}
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => !next && !pending && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Delete “{removing?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Entries are kept.{" "}
            {removing && removing.entryCount > 0
              ? `${entries(removing.entryCount)} will no longer have this ${noun.one}, and its archive page ${termPath(taxonomy.key, removing.slug)} disappears from the content API and sitemap.`
              : `No entries use it.`}
            {removingChildren > 0 &&
              (removingChildren === 1
                ? ` The ${noun.one} inside it moves up one level.`
                : ` The ${removingChildren} ${noun.many} inside it move up one level.`)}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Delete {noun.one}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Levels in the subtree of `id`, including itself. */
function heightOf(tree: Row[], id: string): number {
  const children = tree.filter((term) => term.parentId === id);
  return 1 + Math.max(0, ...children.map((child) => heightOf(tree, child.id)));
}

function TermForm({
  siteId,
  taxonomy,
  tree,
  term,
  parentId,
  onSaved,
}: {
  siteId: string;
  taxonomy: TaxonomySummary;
  tree: Row[];
  term?: TermSummary;
  parentId?: string;
  onSaved: () => void;
}) {
  const noun = termNoun(taxonomy);
  const [state, formAction, pending] = useActionState(saveTermAction, {
    values: {
      name: term?.name ?? "",
      slug: term?.slug ?? "",
      parentId: term?.parentId ?? parentId ?? "",
      description: term?.description ?? "",
      seoTitle: term?.seoTitle ?? "",
      seoDescription: term?.seoDescription ?? "",
    },
  } satisfies TermFormState);
  const [name, setName] = useState(state.values.name);
  const [slug, setSlug] = useState(state.values.slug);
  const [slugEdited, setSlugEdited] = useState(Boolean(term) || Boolean(state.values.slug));
  const shownSlug = slugEdited ? slug : name.trim() ? slugify(name) : "";

  useEffect(() => {
    if (!state.saved) return;
    toast.success(
      state.saved.created ? `Added “${state.saved.name}”.` : `Saved “${state.saved.name}”.`,
    );
    onSaved();
  }, [state, onSaved]);

  // A parent can't be the term itself or below it, and nesting stays within MAX_TERM_DEPTH.
  const parents = useMemo(() => {
    if (!taxonomy.hierarchical) return [];
    const blocked = term ? descendantIds(tree, term.id) : new Set<string>();
    const height = term ? heightOf(tree, term.id) : 1;
    return tree.filter((row) => !blocked.has(row.id) && row.depth + 1 + height <= MAX_TERM_DEPTH);
  }, [taxonomy.hierarchical, tree, term]);

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <form action={formAction} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{term ? `Edit ${noun.one}` : `Add ${noun.one}`}</DialogTitle>
          <DialogDescription>
            {taxonomy.hierarchical
              ? `Nest ${noun.many} up to ${MAX_TERM_DEPTH} levels deep.`
              : `Give it a short, clear name.`}
          </DialogDescription>
        </DialogHeader>
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="taxonomyKey" value={taxonomy.key} />
        {term && <input type="hidden" name="termId" value={term.id} />}
        <FormField
          id="term-name"
          name="name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={state.errors?.name}
          maxLength={80}
          required
          autoFocus
        />
        <FormField
          id="term-slug"
          name="slug"
          label="URL slug"
          value={shownSlug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value.toLowerCase());
          }}
          error={state.errors?.slug}
          hint={
            <>
              Archive page:{" "}
              <code className="font-mono break-all">
                {termPath(taxonomy.key, shownSlug || "example")}
              </code>
              {term && " Changing it changes that address."}
            </>
          }
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          required
        />
        {taxonomy.hierarchical && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="term-parent" className="text-sm font-medium">
              Parent <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <select
              id="term-parent"
              name="parentId"
              defaultValue={state.values.parentId}
              className={selectClass}
              aria-invalid={state.errors?.parentId ? true : undefined}
              aria-describedby={state.errors?.parentId ? "term-parent-error" : undefined}
            >
              <option value="">None (top level)</option>
              {parents.map((row) => (
                <option key={row.id} value={row.id}>
                  {`${"— ".repeat(row.depth)}${row.name}`}
                </option>
              ))}
            </select>
            {state.errors?.parentId && (
              <p id="term-parent-error" className="text-destructive text-sm">
                {state.errors.parentId}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="term-description" className="text-sm font-medium">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            id="term-description"
            name="description"
            defaultValue={state.values.description}
            maxLength={500}
            rows={2}
            aria-describedby="term-description-hint"
          />
          {state.errors?.description ? (
            <p className="text-destructive text-sm">{state.errors.description}</p>
          ) : (
            <p id="term-description-hint" className="text-muted-foreground text-xs">
              Your website can show it at the top of the archive page.
            </p>
          )}
        </div>
        <fieldset className={cn("grid gap-3 rounded-xl border p-3")}>
          <legend className="px-1 text-sm font-medium">
            Search appearance of the archive page
          </legend>
          <FormField
            id="term-seo-title"
            name="seoTitle"
            label="SEO title"
            defaultValue={state.values.seoTitle}
            error={state.errors?.seoTitle}
            hint="Leave empty to use the name."
            maxLength={70}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="term-seo-description" className="text-sm font-medium">
              Meta description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="term-seo-description"
              name="seoDescription"
              defaultValue={state.values.seoDescription}
              maxLength={160}
              rows={2}
            />
            {state.errors?.seoDescription && (
              <p className="text-destructive text-sm">{state.errors.seoDescription}</p>
            )}
          </div>
        </fieldset>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Saving…" : term ? "Save changes" : `Add ${noun.one}`}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
