import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Discloses that a view is rendering placeholder data, not a live backend. */
export function MockDataNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs",
        className,
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      Sample data. The backend isn&apos;t connected yet, so nothing here is real.
    </p>
  );
}
