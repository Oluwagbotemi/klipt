"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Boxes, ChevronRight, Loader2, Plus } from "lucide-react";
import {
  createModelAction,
  type ModelFormState,
  type NewModelValues,
} from "@/app/(site)/sites/[siteId]/models/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
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
import { keyFromLabel, type ModelSummary } from "@/lib/models";
import { siteHref } from "@/lib/navigation";
import { entryPath } from "@/lib/seo";
import {
  DescriptionField,
  ReadOnlyNote,
  SchemaTypeSelect,
} from "@/components/models/model-form-parts";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Structure › Content models: built-in and custom content types. */
export function ModelList({
  siteId,
  models,
  canManage,
}: {
  siteId: string;
  models: ModelSummary[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const builtIn = models.filter((model) => model.isSystem);
  const custom = models.filter((model) => !model.isSystem);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-muted-foreground max-w-prose text-sm">
          A content type describes one kind of content, like a product or an event: the fields it
          has and what your website receives through the content API.
        </p>
        {canManage && (
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden /> New content type
          </Button>
        )}
      </div>

      {!canManage && (
        <ReadOnlyNote>
          You can view content types. Only owners and admins can change them.
        </ReadOnlyNote>
      )}

      <ModelGroup title="Built in" siteId={siteId} models={builtIn} />

      {custom.length > 0 ? (
        <ModelGroup title="Custom" siteId={siteId} models={custom} />
      ) : (
        <section
          aria-labelledby="custom-models"
          className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-5"
        >
          <span className="bg-muted grid size-10 place-items-center rounded-xl" aria-hidden>
            <Boxes className="text-muted-foreground size-5" />
          </span>
          <div>
            <h2 id="custom-models" className="text-base font-semibold">
              No custom content types yet
            </h2>
            <p className="text-muted-foreground text-sm">
              Add one for content that isn&apos;t a page or a post, such as products, team members
              or events. Its entries appear under Content › Collections.
            </p>
          </div>
          {canManage && (
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus aria-hidden /> New content type
            </Button>
          )}
        </section>
      )}

      {canManage && (
        <Dialog open={creating} onOpenChange={setCreating}>
          {creating && <NewModelDialog siteId={siteId} />}
        </Dialog>
      )}
    </div>
  );
}

function ModelGroup({
  title,
  siteId,
  models,
}: {
  title: string;
  siteId: string;
  models: ModelSummary[];
}) {
  const id = `models-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h2>
      <ul className="bg-card divide-y rounded-2xl border">
        {models.map((model) => (
          <li key={model.id}>
            <Link
              href={`${siteHref(siteId, "models")}/${model.id}`}
              className="hover:bg-accent/50 focus-visible:ring-ring/50 flex items-center gap-4 px-4 py-3 outline-none first:rounded-t-2xl last:rounded-b-2xl focus-visible:ring-[3px] focus-visible:ring-inset sm:px-5"
            >
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold uppercase">
                {model.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{model.name}</span>
                  <code className="text-muted-foreground font-mono text-xs">{model.key}</code>
                  {model.schemaType && <Badge variant="outline">{model.schemaType}</Badge>}
                </span>
                <span className="text-muted-foreground block truncate text-sm">
                  {model.description || `URLs like ${entryPath(model.key, "example")}`}
                </span>
              </span>
              <span className="text-muted-foreground hidden shrink-0 text-right text-xs sm:block">
                <span className="block">{count(model.fields.length, "field", "fields")}</span>
                <span className="block">{count(model.entryCount, "entry", "entries")}</span>
              </span>
              <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewModelDialog({ siteId }: { siteId: string }) {
  const [state, formAction, pending] = useActionState(createModelAction, {
    values: { name: "", key: "", description: "", schemaType: "" },
  } satisfies ModelFormState<NewModelValues>);
  const [name, setName] = useState(state.values.name);
  const [key, setKey] = useState(state.values.key);
  const [keyEdited, setKeyEdited] = useState(Boolean(state.values.key));
  const shownKey = keyEdited ? key : keyFromLabel(name, "-");

  return (
    <DialogContent>
      <form action={formAction} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>New content type</DialogTitle>
          <DialogDescription>
            Name it, then add fields on the next screen. You can change everything except the key
            later.
          </DialogDescription>
        </DialogHeader>
        {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
        <input type="hidden" name="siteId" value={siteId} />
        <FormField
          id="model-name"
          name="name"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={state.errors?.name}
          hint="Singular, e.g. Product or Event."
          maxLength={60}
          required
          autoFocus
        />
        <FormField
          id="model-key"
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
              Used in the API (<code className="font-mono">?type={shownKey || "product"}</code>) and
              URLs (<code className="font-mono">/{shownKey || "product"}/…</code>). It can&apos;t
              change after you create the type.
            </>
          }
          className="[&_input]:font-mono"
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <DescriptionField
          defaultValue={state.values.description}
          error={state.errors?.description}
        />
        <SchemaTypeSelect defaultValue={state.values.schemaType} error={state.errors?.schemaType} />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Creating…" : "Create content type"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
