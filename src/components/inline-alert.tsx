import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function InlineAlert({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/30 bg-destructive/5 text-destructive flex gap-2 rounded-lg border px-3 py-2.5 text-sm",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
