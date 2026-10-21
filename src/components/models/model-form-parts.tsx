import { Lock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SCHEMA_TYPES } from "@/lib/models";

export const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-60";

/** Shown to members who can see content types but not change them. */
export function ReadOnlyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-muted text-muted-foreground flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm">
      <Lock className="size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export function DescriptionField({
  defaultValue,
  error,
  disabled,
}: {
  defaultValue: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="model-description" className="text-sm font-medium">
        Description <span className="text-muted-foreground font-normal">(optional)</span>
      </label>
      <Textarea
        id="model-description"
        name="description"
        defaultValue={defaultValue}
        maxLength={200}
        rows={2}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "model-description-error" : "model-description-hint"}
      />
      {error ? (
        <p id="model-description-error" className="text-destructive text-sm">
          {error}
        </p>
      ) : (
        <p id="model-description-hint" className="text-muted-foreground text-xs">
          Helps your team know what it&apos;s for.
        </p>
      )}
    </div>
  );
}

export function SchemaTypeSelect({
  defaultValue,
  error,
  disabled,
}: {
  defaultValue: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="model-schema-type" className="text-sm font-medium">
        Structured data type <span className="text-muted-foreground font-normal">(optional)</span>
      </label>
      <select
        id="model-schema-type"
        name="schemaType"
        defaultValue={defaultValue}
        disabled={disabled}
        className={selectClass}
        aria-invalid={error ? true : undefined}
        aria-describedby="model-schema-type-hint"
      >
        <option value="">None</option>
        {SCHEMA_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <p id="model-schema-type-hint" className="text-muted-foreground text-xs">
        The schema.org type your website can use for structured data, e.g. Product. The content API
        returns it as <code className="font-mono">seo.schemaType</code>.
      </p>
    </div>
  );
}
