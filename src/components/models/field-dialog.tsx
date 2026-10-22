"use client";

import { useState } from "react";
import { Loader2, TextCursorInput } from "lucide-react";
import { FormField } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  FIELD_TYPE_KEYS,
  FIELD_TYPES,
  fieldDefinitionSchema,
  keyFromLabel,
  type ContentFieldDefinition,
  type FieldType,
} from "@/lib/models";

/** Add a field, or edit one (its key and type stay as they are). */
export function FieldDialog({
  field,
  takenKeys,
  models,
  pending,
  error,
  onSubmit,
}: {
  field: ContentFieldDefinition | null;
  takenKeys: string[];
  models: { key: string; name: string }[];
  pending: boolean;
  error: string | null;
  onSubmit: (field: ContentFieldDefinition) => void;
}) {
  const isNew = field === null;
  const [label, setLabel] = useState(field?.label ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  const [keyEdited, setKeyEdited] = useState(!isNew);
  const [type, setType] = useState<FieldType>((field?.type as FieldType) ?? "text");
  const [required, setRequired] = useState(field?.required ?? false);
  const [helpText, setHelpText] = useState(field?.helpText ?? "");
  const [options, setOptions] = useState((field?.options ?? []).join("\n"));
  const [targets, setTargets] = useState<string[]>(field?.referenceModelKeys ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const shownKey = keyEdited ? key : keyFromLabel(label, "_");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const candidate = {
      key: shownKey,
      label,
      type,
      required,
      helpText: helpText.trim() || undefined,
      options: options
        .split("\n")
        .map((option) => option.trim())
        .filter(Boolean),
      referenceModelKeys: targets,
    };
    const parsed = fieldDefinitionSchema.safeParse(candidate);
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        next[String(issue.path[0] ?? "form")] ??= issue.message;
    } else if (isNew && takenKeys.includes(parsed.data.key)) {
      next.key = "Another field already uses this key.";
    }
    setErrors(next);
    if (parsed.success && Object.keys(next).length === 0) onSubmit(parsed.data);
  }

  return (
    <DialogContent size="lg">
      <DialogForm onSubmit={submit} noValidate>
        <DialogHeader icon={TextCursorInput}>
          <DialogTitle>{isNew ? "Add field" : `Edit “${field.label}”`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Editors fill this in for each entry; your website gets it in the content API."
              : "The key and type can't change, so saved values keep their meaning."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error && <InlineAlert>{error}</InlineAlert>}

          <FormField
            id="field-label"
            label="Label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            error={errors.label}
            hint="What editors see, e.g. Price."
            maxLength={60}
            required
            autoFocus
          />
          <FormField
            id="field-key"
            label="Key"
            value={shownKey}
            onChange={(event) => {
              setKeyEdited(true);
              setKey(event.target.value.toLowerCase());
            }}
            error={errors.key}
            hint={
              isNew ? (
                <>
                  Name in the API: <code className="font-mono">fields.{shownKey || "price"}</code>.
                  It can&apos;t change later.
                </>
              ) : (
                "Keys can't change after a field is created."
              )
            }
            readOnly={!isNew}
            className="[&_input]:font-mono"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            required
          />

          <fieldset className="grid gap-2" disabled={!isNew}>
            <legend className="mb-1 text-sm font-medium">Type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FIELD_TYPE_KEYS.map((option) => (
                <label
                  key={option}
                  className="hover:bg-accent/50 has-focus-visible:ring-ring/50 has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer gap-3 rounded-lg border px-3 py-2 has-focus-visible:ring-[3px] has-disabled:cursor-not-allowed has-disabled:opacity-60 has-checked:has-disabled:opacity-100"
                >
                  <input
                    type="radio"
                    name="field-type"
                    value={option}
                    checked={type === option}
                    onChange={() => setType(option)}
                    className="accent-primary mt-1 size-4 shrink-0 outline-none"
                  />
                  <span>
                    <span className="block text-sm font-medium">{FIELD_TYPES[option].label}</span>
                    <span className="text-muted-foreground block text-xs">
                      {FIELD_TYPES[option].description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {type === "select" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="field-options" className="text-sm font-medium">
                Choices
              </label>
              <Textarea
                id="field-options"
                value={options}
                onChange={(event) => setOptions(event.target.value)}
                rows={4}
                aria-invalid={errors.options ? true : undefined}
                aria-describedby="field-options-hint"
              />
              {errors.options && <p className="text-destructive text-sm">{errors.options}</p>}
              <p id="field-options-hint" className="text-muted-foreground text-xs">
                One per line. The API returns the chosen text exactly as written.
              </p>
            </div>
          )}

          {type === "reference" && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Can link to</legend>
              <div className="flex flex-wrap gap-2">
                {models.map((model) => (
                  <label
                    key={model.key}
                    className="has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm has-focus-visible:ring-[3px]"
                  >
                    <input
                      type="checkbox"
                      checked={targets.includes(model.key)}
                      onChange={(event) =>
                        setTargets((current) =>
                          event.target.checked
                            ? [...current, model.key]
                            : current.filter((item) => item !== model.key),
                        )
                      }
                      className="accent-primary size-4 outline-none"
                    />
                    {model.name}
                  </label>
                ))}
              </div>
              {errors.referenceModelKeys && (
                <p className="text-destructive text-sm">{errors.referenceModelKeys}</p>
              )}
            </fieldset>
          )}

          <div className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5">
            <label htmlFor="field-required" className="text-sm">
              <span className="block font-medium">Required</span>
              <span className="text-muted-foreground block text-xs">
                Drafts can stay incomplete; publishing needs a value.
              </span>
            </label>
            <Switch id="field-required" checked={required} onCheckedChange={setRequired} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="field-help" className="text-sm font-medium">
              Help text <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="field-help"
              value={helpText}
              onChange={(event) => setHelpText(event.target.value)}
              maxLength={200}
              rows={2}
              aria-describedby="field-help-hint"
            />
            <p id="field-help-hint" className="text-muted-foreground text-xs">
              Shown under the field in the editor.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {isNew ? "Add field" : "Save field"}
          </Button>
        </DialogFooter>
      </DialogForm>
    </DialogContent>
  );
}
