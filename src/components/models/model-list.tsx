"use client";

import { useActionState, useState } from "react";
import { Boxes, FileText, ListTree, Loader2, Plus } from "lucide-react";
import {
  createModelAction,
  type ModelFormState,
  type NewModelValues,
} from "@/app/(site)/sites/[siteId]/models/actions";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { CardArrow, LinkCard } from "@/components/visual/card";
import { Illustration } from "@/components/visual/illustration";
import { InfoChip } from "@/components/visual/info-chip";
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
import { keyFromLabel, type ModelSummary } from "@/lib/models";
import { siteHref } from "@/lib/navigation";
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
    <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-8">
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
          className="border-card-border flex flex-col items-start gap-4 rounded-(--radius-card) border border-dashed p-5 sm:flex-row sm:items-center sm:p-6"
        >
          <Illustration scene="structure" className="h-20" />
          <div className="flex flex-1 flex-col items-start gap-3">
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
              <Button variant="soft" onClick={() => setCreating(true)}>
                <Plus aria-hidden /> New content type
              </Button>
            )}
          </div>
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
      <ul data-card-grid className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {models.map((model) => (
          <li key={model.id} className="min-w-0">
            <LinkCard
              href={`${siteHref(siteId, "models")}/${model.id}`}
              footer={
                <>
                  <InfoChip icon={ListTree}>
                    {count(model.fields.length, "field", "fields")}
                  </InfoChip>
                  <InfoChip icon={FileText} tone={model.entryCount > 0 ? "accent" : "neutral"}>
                    {count(model.entryCount, "entry", "entries")}
                  </InfoChip>
                  {model.schemaType && (
                    <span className="ml-auto truncate font-mono">{model.schemaType}</span>
                  )}
                </>
              }
            >
              <span className="flex items-start gap-3">
                <span className="bg-primary-soft text-primary-strong grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold uppercase">
                  {model.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{model.name}</span>
                  <code className="text-muted-foreground font-mono text-xs">{model.key}</code>
                </span>
                <CardArrow />
              </span>
              <span className="text-muted-foreground line-clamp-2 text-sm">
                {model.description || `URLs like ${model.urlPattern}`}
              </span>
            </LinkCard>
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
    <DialogContent size="md">
      <DialogForm action={formAction}>
        <DialogHeader icon={Boxes}>
          <DialogTitle>New content type</DialogTitle>
          <DialogDescription>
            Name it, then add fields on the next screen. You can change everything except the key
            later.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
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
                Used in the API (<code className="font-mono">?type={shownKey || "product"}</code>)
                and URLs (<code className="font-mono">/{shownKey || "product"}/…</code>). It
                can&apos;t change after you create the type.
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
          <SchemaTypeSelect
            defaultValue={state.values.schemaType}
            error={state.errors?.schemaType}
          />
        </DialogBody>
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
      </DialogForm>
    </DialogContent>
  );
}
