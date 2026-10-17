import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapsible group in the editor's settings column (native <details>, keyboard accessible). */
export function SettingsSection({
  title,
  description,
  defaultOpen = true,
  children,
  className,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group bg-card rounded-2xl border", className)}>
      <summary className="focus-visible:ring-ring/50 flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 outline-none focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {description && (
            <span className="text-muted-foreground block text-xs">{description}</span>
          )}
        </span>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

/** "52 characters" with neutral guidance; never an error. */
export function LengthHint({
  id,
  length,
  min,
  max,
  fallback,
}: {
  id: string;
  length: number;
  min: number;
  max: number;
  fallback?: string;
}) {
  const over = length > max;
  return (
    <p id={id} className={cn("text-xs", over ? "text-warning" : "text-muted-foreground")}>
      {length === 0 && fallback
        ? fallback
        : `${length} characters · results usually show about ${min}–${max}${over ? ", so it may be shortened" : ""}.`}
    </p>
  );
}
