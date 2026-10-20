"use client";

import { useEffect, useState, useTransition } from "react";
import { ImageIcon, Link2, Loader2, Search, X } from "lucide-react";
import { searchLinkTargetsAction } from "@/app/(site)/sites/[siteId]/content/actions";
import { ContentStatusBadge } from "@/components/content/status-badge";
import { MediaPicker } from "@/components/media/media-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ContentStatus } from "@/lib/content";
import {
  LONG_TEXT_MAX,
  TEXT_MAX,
  type ContentFieldDefinition,
  type FieldRefs,
  type FieldValue,
  type LinkTarget,
} from "@/lib/models";
import { cn } from "@/lib/utils";

const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-60";

/**
 * The content type's own fields (e.g. a product's price and photo), below the
 * body. Values save with the entry; required ones are only enforced on publish.
 */
export function FieldsPanel({
  siteId,
  entryId,
  modelName,
  fields,
  values,
  refs,
  errors,
  readOnly,
  canUpload,
  onChange,
  onRefs,
}: {
  siteId: string;
  entryId: string;
  modelName: string;
  fields: ContentFieldDefinition[];
  values: Record<string, FieldValue>;
  refs: FieldRefs;
  errors: Record<string, string>;
  readOnly: boolean;
  canUpload: boolean;
  onChange: (key: string, value: FieldValue | null) => void;
  onRefs: (patch: Partial<FieldRefs>) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <section
      aria-labelledby="entry-fields-heading"
      className="bg-card mt-8 flex flex-col gap-5 rounded-2xl border p-4 sm:p-5"
    >
      <div>
        <h2 id="entry-fields-heading" className="text-sm font-semibold">
          {modelName} fields
        </h2>
        <p className="text-muted-foreground text-xs">
          Your website gets these in the content API under <code className="font-mono">fields</code>
          . Drafts can leave required fields empty; they&apos;re needed to publish.
        </p>
      </div>
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          siteId={siteId}
          entryId={entryId}
          field={field}
          value={values[field.key]}
          refs={refs}
          error={errors[field.key]}
          readOnly={readOnly}
          canUpload={canUpload}
          onChange={(value) => onChange(field.key, value)}
          onRefs={onRefs}
        />
      ))}
    </section>
  );
}

function FieldInput({
  siteId,
  entryId,
  field,
  value,
  refs,
  error,
  readOnly,
  canUpload,
  onChange,
  onRefs,
}: {
  siteId: string;
  entryId: string;
  field: ContentFieldDefinition;
  value: FieldValue | undefined;
  refs: FieldRefs;
  error?: string;
  readOnly: boolean;
  canUpload: boolean;
  onChange: (value: FieldValue | null) => void;
  onRefs: (patch: Partial<FieldRefs>) => void;
}) {
  const id = `field-${field.key}`;
  const hintId = field.helpText ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    disabled: readOnly,
  };
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";

  let control: React.ReactNode;
  switch (field.type) {
    case "long_text":
    case "rich_text":
      control = (
        <Textarea
          {...common}
          value={text}
          maxLength={LONG_TEXT_MAX}
          rows={4}
          onChange={(event) => onChange(event.target.value || null)}
        />
      );
      break;
    case "number":
      control = (
        <Input
          {...common}
          type="number"
          inputMode="decimal"
          step="any"
          value={text}
          className="sm:max-w-60"
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        />
      );
      break;
    case "date":
      control = (
        <Input
          {...common}
          type="date"
          value={text}
          className="sm:max-w-60"
          onChange={(event) => onChange(event.target.value || null)}
        />
      );
      break;
    case "boolean":
      control = (
        <div className="flex items-center gap-3">
          <Switch
            {...common}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <span className="text-muted-foreground text-sm" aria-hidden>
            {value === true ? "Yes" : value === false ? "No" : "Not set"}
          </span>
        </div>
      );
      break;
    case "select":
      control = (
        <select
          {...common}
          value={text}
          className={cn(selectClass, "sm:max-w-80")}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">— Not set —</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
      break;
    case "media":
      control = (
        <ImageField
          siteId={siteId}
          field={field}
          mediaId={typeof value === "string" ? value : null}
          refs={refs}
          readOnly={readOnly}
          canUpload={canUpload}
          describedBy={describedBy}
          onChange={onChange}
          onRefs={onRefs}
        />
      );
      break;
    case "reference":
      control = (
        <LinkField
          siteId={siteId}
          entryId={entryId}
          field={field}
          targetId={typeof value === "string" ? value : null}
          refs={refs}
          readOnly={readOnly}
          describedBy={describedBy}
          onChange={onChange}
          onRefs={onRefs}
        />
      );
      break;
    default:
      control = (
        <Input
          {...common}
          value={text}
          maxLength={TEXT_MAX}
          onChange={(event) => onChange(event.target.value || null)}
        />
      );
  }

  const usesLabel = field.type !== "media" && field.type !== "reference";
  const Label = usesLabel ? "label" : "p";
  return (
    <div className="flex flex-col gap-1.5" data-field={field.key}>
      <Label
        {...(usesLabel ? { htmlFor: id } : { id: `${id}-label` })}
        className="text-sm font-medium"
      >
        {field.label}
        <span className="text-muted-foreground font-normal">
          {field.required ? " (required to publish)" : " (optional)"}
        </span>
      </Label>
      {control}
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
      {field.helpText && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {field.helpText}
        </p>
      )}
    </div>
  );
}

function ImageField({
  siteId,
  field,
  mediaId,
  refs,
  readOnly,
  canUpload,
  describedBy,
  onChange,
  onRefs,
}: {
  siteId: string;
  field: ContentFieldDefinition;
  mediaId: string | null;
  refs: FieldRefs;
  readOnly: boolean;
  canUpload: boolean;
  describedBy?: string;
  onChange: (value: FieldValue | null) => void;
  onRefs: (patch: Partial<FieldRefs>) => void;
}) {
  const [open, setOpen] = useState(false);
  const asset = mediaId ? refs.media[mediaId] : null;
  const labelId = `field-${field.key}-label`;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-wrap items-center gap-3"
    >
      {mediaId ? (
        <div className="flex w-full min-w-0 items-center gap-3 rounded-xl border p-2 sm:w-auto sm:flex-1">
          <span className="bg-muted size-16 shrink-0 overflow-hidden rounded-lg">
            {asset ? (
              // eslint-disable-next-line @next/next/no-img-element -- files come from Blob/local storage
              <img src={asset.url} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="text-muted-foreground m-auto mt-5 size-6" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {asset?.filename ?? "Image not found"}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {asset
                ? asset.altText
                  ? `Alt text: ${asset.altText}`
                  : "No alt text yet"
                : "It may have been deleted. Choose another."}
            </span>
          </span>
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">No image chosen.</span>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ImageIcon aria-hidden /> {mediaId ? "Change" : "Choose image"}
            <span className="sr-only"> for {field.label}</span>
          </Button>
          {mediaId && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X aria-hidden /> Remove<span className="sr-only"> {field.label}</span>
            </Button>
          )}
        </div>
      )}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        siteId={siteId}
        canUpload={canUpload}
        title={`Choose ${field.label.toLowerCase()}`}
        actionLabel="Use image"
        onInsert={(picked, alt) => {
          onRefs({
            media: {
              ...refs.media,
              [picked.id]: { url: picked.url, altText: alt || null, filename: picked.filename },
            },
          });
          onChange(picked.id);
          setOpen(false);
        }}
      />
    </div>
  );
}

function LinkField({
  siteId,
  entryId,
  field,
  targetId,
  refs,
  readOnly,
  describedBy,
  onChange,
  onRefs,
}: {
  siteId: string;
  entryId: string;
  field: ContentFieldDefinition;
  targetId: string | null;
  refs: FieldRefs;
  readOnly: boolean;
  describedBy?: string;
  onChange: (value: FieldValue | null) => void;
  onRefs: (patch: Partial<FieldRefs>) => void;
}) {
  const [open, setOpen] = useState(false);
  const target = targetId ? refs.entries[targetId] : null;
  const labelId = `field-${field.key}-label`;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-wrap items-center gap-3"
    >
      {targetId ? (
        <div className="flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 sm:w-auto sm:flex-1">
          <Link2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {target?.title ?? "Entry not found"}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {target
                ? `${target.modelName}${target.status === "published" ? "" : " · only sent to your website once it's published"}`
                : "It may have been deleted. Choose another."}
            </span>
          </span>
          {target && <ContentStatusBadge status={target.status as ContentStatus} />}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">Nothing linked.</span>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Link2 aria-hidden /> {targetId ? "Change" : "Choose entry"}
            <span className="sr-only"> for {field.label}</span>
          </Button>
          {targetId && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X aria-hidden /> Remove<span className="sr-only"> {field.label}</span>
            </Button>
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <EntryPickerDialog
            siteId={siteId}
            entryId={entryId}
            field={field}
            onPick={(picked) => {
              onRefs({
                entries: {
                  ...refs.entries,
                  [picked.id]: {
                    title: picked.title,
                    modelName: picked.modelName,
                    status: picked.status,
                  },
                },
              });
              onChange(picked.id);
              setOpen(false);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function EntryPickerDialog({
  siteId,
  entryId,
  field,
  onPick,
}: {
  siteId: string;
  entryId: string;
  field: ContentFieldDefinition;
  onPick: (target: LinkTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkTarget[] | null>(null);
  const [loading, startLoading] = useTransition();
  const modelKeys = field.referenceModelKeys ?? [];

  useEffect(() => {
    const timer = setTimeout(
      () =>
        startLoading(async () => {
          setResults(
            await searchLinkTargetsAction(siteId, {
              modelKeys,
              q: query.trim(),
              excludeId: entryId,
            }),
          );
        }),
      results === null ? 0 : 250,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on query changes only
  }, [query]);

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Choose {field.label.toLowerCase()}</DialogTitle>
        <DialogDescription>
          Pick the entry to link to. Your website only receives it once it&apos;s published.
        </DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search entries"
          placeholder="Search by title or slug"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>
      <div className="max-h-80 min-h-32 overflow-y-auto" aria-busy={loading}>
        {results === null ? (
          <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading entries…
          </p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {query.trim()
              ? `Nothing matches “${query.trim()}”.`
              : "No entries to link to yet. Create one in Content first."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Entries">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => onPick(result)}
                  className="hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-[3px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {result.title || "Untitled"}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {result.modelName} · {result.path}
                    </span>
                  </span>
                  <ContentStatusBadge status={result.status as ContentStatus} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogContent>
  );
}
