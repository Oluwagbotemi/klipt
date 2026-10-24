"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  CheckCircle2,
  FileText,
  Hash,
  ImageIcon,
  Link2,
  ListChecks,
  ListTree,
  Loader2,
  type LucideIcon,
  Pencil,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteModelAction,
  saveModelFieldsAction,
  updateModelDetailsAction,
  type ModelDetailsValues,
  type ModelFormState,
} from "@/app/(site)/sites/[siteId]/models/actions";
import { FieldDialog } from "@/components/models/field-dialog";
import {
  DescriptionField,
  ReadOnlyNote,
  SchemaTypeSelect,
} from "@/components/models/model-form-parts";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { SettingsCard } from "@/components/settings/settings-card";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  FIELD_TYPES,
  MAX_FIELDS,
  type ContentFieldDefinition,
  type FieldType,
  type ModelSummary,
} from "@/lib/models";
import { siteHref } from "@/lib/navigation";

export const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  long_text: AlignLeft,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
  select: ListChecks,
  media: ImageIcon,
  reference: Link2,
};

type ModelRef = { key: string; name: string };

/** One content type: its details, its fields, and deleting it. */
export function ModelEditor({
  siteId,
  model,
  allModels,
  canManage,
}: {
  siteId: string;
  model: ModelSummary;
  allModels: ModelRef[];
  canManage: boolean;
}) {
  const [version, setVersion] = useState(model.updatedAt);
  const [fields, setFields] = useState(model.fields);
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [removing, setRemoving] = useState<ContentFieldDefinition | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // A newer version from the server (after refresh()) wins over local state.
  const [syncedVersion, setSyncedVersion] = useState(model.updatedAt);
  if (model.updatedAt !== syncedVersion) {
    setSyncedVersion(model.updatedAt);
    if (model.updatedAt > version) {
      setVersion(model.updatedAt);
      setFields(model.fields);
    }
  }

  const contentHref = siteHref(siteId, "content");
  const entriesHref = !model.isSystem
    ? `${contentHref}/collections`
    : `${contentHref}/${model.key === "page" ? "pages" : "posts"}`;
  const modelNames = new Map(allModels.map((item) => [item.key, item.name]));

  function persist(next: ContentFieldDefinition[], done: string): Promise<boolean> {
    setFieldsError(null);
    return new Promise((resolve) =>
      startSaving(async () => {
        const result = await saveModelFieldsAction(siteId, model.id, {
          fields: next,
          expectedUpdatedAt: version,
        });
        if (result.ok) {
          setVersion(result.updatedAt);
          setFields(result.fields);
          toast.success(done);
          resolve(true);
        } else {
          setFieldsError(result.error);
          resolve(false);
        }
      }),
    );
  }

  function move(index: number, by: -1 | 1) {
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(index + by, 0, field);
    void persist(next, `Moved “${field.label}” ${by < 0 ? "up" : "down"}.`);
  }

  const editingField = editing?.index != null ? fields[editing.index] : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <div className="flex flex-col gap-3">
        <Link
          href={siteHref(siteId, "models")}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-fit items-center gap-1.5 rounded text-sm outline-none focus-visible:ring-[3px]"
        >
          <ArrowLeft className="size-4" aria-hidden /> All content types
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{model.name}</h2>
          {model.isSystem && <Badge variant="secondary">Built in</Badge>}
          <code className="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">{model.key}</code>
        </div>
        <p className="text-muted-foreground text-sm">
          URLs like <code className="font-mono">{model.urlPattern}</code> ·{" "}
          <Link
            href={entriesHref}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {model.entryCount} {model.entryCount === 1 ? "entry" : "entries"}
          </Link>
        </p>
      </div>

      {!canManage && (
        <ReadOnlyNote>
          You can view this content type. Only owners and admins can change it.
        </ReadOnlyNote>
      )}

      <SettingsCard
        title="Fields"
        icon={ListTree}
        description={
          model.isSystem
            ? `Extra fields for every ${model.name.toLowerCase()}, besides its title, body and SEO.`
            : `What every ${model.name.toLowerCase()} has, besides its title, URL and SEO. Your website receives them in the content API under fields.`
        }
      >
        <div className="flex flex-col gap-4">
          {fieldsError && <InlineAlert>{fieldsError}</InlineAlert>}
          {fields.length === 0 ? (
            <p className="text-muted-foreground border-card-border bg-card-nested rounded-(--radius-nested) border border-dashed px-4 py-6 text-center text-sm">
              No fields yet.
              {canManage && " Add one for each piece of information, e.g. a price or a photo."}
            </p>
          ) : (
            <ol
              className="border-card-border divide-card-border divide-y rounded-(--radius-nested) border"
              aria-busy={saving}
            >
              {fields.map((field, index) => {
                const Icon = FIELD_ICONS[field.type as FieldType] ?? Type;
                const targets = field.referenceModelKeys
                  ?.map((key) => modelNames.get(key) ?? key)
                  .join(", ");
                return (
                  <li
                    key={field.key}
                    className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4"
                  >
                    <span
                      className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg"
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{field.label}</span>
                        {field.required && <Badge variant="outline">Required</Badge>}
                      </p>
                      <p className="text-muted-foreground text-xs break-words">
                        {FIELD_TYPES[field.type as FieldType]?.label ?? field.type} ·{" "}
                        <code className="font-mono">{field.key}</code>
                        {field.type === "select" && ` · ${field.options?.join(", ")}`}
                        {field.type === "reference" && targets && ` · to ${targets}`}
                      </p>
                    </div>
                    {canManage && (
                      <div className="-my-1 flex w-full items-center justify-end gap-1 sm:w-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={saving || index === 0}
                          onClick={() => move(index, -1)}
                          aria-label={`Move ${field.label} up`}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={saving || index === fields.length - 1}
                          onClick={() => move(index, 1)}
                          aria-label={`Move ${field.label} down`}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={saving}
                          onClick={() => setEditing({ index })}
                          aria-label={`Edit ${field.label}`}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={saving}
                          onClick={() => setRemoving(field)}
                          aria-label={`Remove ${field.label}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {canManage && (
            <div>
              <Button
                variant="outline"
                onClick={() => setEditing({ index: null })}
                disabled={saving || fields.length >= MAX_FIELDS}
              >
                <Plus aria-hidden /> Add field
              </Button>
              {fields.length >= MAX_FIELDS && (
                <p className="text-muted-foreground mt-2 text-xs">
                  A content type can have up to {MAX_FIELDS} fields.
                </p>
              )}
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard title="Details" icon={FileText}>
        <DetailsForm
          siteId={siteId}
          model={model}
          version={version}
          onSaved={setVersion}
          canManage={canManage}
        />
      </SettingsCard>

      {!model.isSystem && canManage && (
        <SettingsCard title="Delete content type" tone="danger" icon={Trash2}>
          <DeleteModel siteId={siteId} model={model} entriesHref={entriesHref} />
        </SettingsCard>
      )}

      {canManage && (
        <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
          {editing !== null && (
            <FieldDialog
              key={editingField?.key ?? "new"}
              field={editingField}
              takenKeys={fields
                .map((field) => field.key)
                .filter((key) => key !== editingField?.key)}
              models={allModels}
              pending={saving}
              error={fieldsError}
              onSubmit={async (field) => {
                const next =
                  editing.index === null
                    ? [...fields, field]
                    : fields.map((item, index) => (index === editing.index ? field : item));
                const ok = await persist(
                  next,
                  editing.index === null ? `Added “${field.label}”.` : `Saved “${field.label}”.`,
                );
                if (ok) setEditing(null);
              }}
            />
          )}
        </Dialog>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader icon={Trash2} tone="destructive">
            <AlertDialogTitle>Remove “{removing?.label}”?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              Editors won&apos;t see it any more and the content API stops returning it. Values
              already saved in entries are kept, so adding a field with the same key brings them
              back.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removing) return;
                void persist(
                  fields.filter((field) => field.key !== removing.key),
                  `Removed “${removing.label}”.`,
                );
                setRemoving(null);
              }}
            >
              Remove field
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailsForm({
  siteId,
  model,
  version,
  onSaved,
  canManage,
}: {
  siteId: string;
  model: ModelSummary;
  version: string;
  onSaved: (version: string) => void;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: ModelFormState<ModelDetailsValues>, formData: FormData) => {
      const result = await updateModelDetailsAction(previous, formData);
      if (result.updatedAt) {
        onSaved(result.updatedAt);
        toast.success("Details saved.");
      }
      return result;
    },
    {
      values: {
        name: model.name,
        description: model.description ?? "",
        schemaType: model.schemaType ?? "",
      },
    } satisfies ModelFormState<ModelDetailsValues>,
  );

  return (
    <form action={formAction} className="grid gap-4">
      {state.errors?.form && <InlineAlert>{state.errors.form}</InlineAlert>}
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="modelId" value={model.id} />
      <input type="hidden" name="expectedUpdatedAt" value={version} />
      {model.isSystem && <input type="hidden" name="name" value={model.name} />}
      <FormField
        id="model-name"
        name={model.isSystem ? undefined : "name"}
        label="Name"
        defaultValue={state.values.name}
        error={state.errors?.name}
        hint={model.isSystem ? "Built-in content types keep their name." : undefined}
        disabled={model.isSystem || !canManage}
        maxLength={60}
        required
      />
      <DescriptionField
        defaultValue={state.values.description}
        error={state.errors?.description}
        disabled={!canManage}
      />
      <SchemaTypeSelect
        defaultValue={state.values.schemaType}
        error={state.errors?.schemaType}
        disabled={!canManage}
      />
      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? "Saving…" : "Save details"}
          </Button>
          {state.saved && !pending && (
            <span className="text-success flex items-center gap-1.5 text-sm" role="status">
              <CheckCircle2 className="size-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function DeleteModel({
  siteId,
  model,
  entriesHref,
}: {
  siteId: string;
  model: ModelSummary;
  entriesHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inUse = model.entryCount > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="max-w-prose text-sm">
        {inUse ? (
          <p className="text-muted-foreground">
            {model.name} has {model.entryCount} {model.entryCount === 1 ? "entry" : "entries"}{" "}
            (archived ones count too). To protect that content, delete them in{" "}
            <Link href={entriesHref} className="text-foreground underline underline-offset-2">
              Content
            </Link>{" "}
            first.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Removes this content type for good. It has no entries.
          </p>
        )}
        {error && <InlineAlert className="mt-3">{error}</InlineAlert>}
      </div>
      <Button variant="destructive" disabled={inUse || pending} onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Delete {model.name}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader icon={Trash2} tone="destructive">
            <AlertDialogTitle>Delete “{model.name}”?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogDescription>
              This can&apos;t be undone. Websites asking the content API for{" "}
              <code className="font-mono">type={model.key}</code> will get nothing back.
            </AlertDialogDescription>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await deleteModelAction(siteId, model.id);
                  if (result?.error) setError(result.error);
                })
              }
            >
              Delete content type
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
