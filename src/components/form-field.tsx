import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Labelled text input with help text and an accessible error message. */
export function FormField({
  id,
  label,
  hint,
  error,
  required,
  className,
  ...inputProps
}: Omit<React.ComponentProps<typeof Input>, "id"> & {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="text-muted-foreground font-normal"> (required)</span>
        ) : (
          <span className="text-muted-foreground font-normal"> (optional)</span>
        )}
      </label>
      <Input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}
