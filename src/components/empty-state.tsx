import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered empty state with one concise message and a next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center sm:py-24",
        className,
      )}
    >
      <div aria-hidden className="relative mb-6 h-24 w-36">
        <span className="bg-muted absolute top-3 left-0 h-20 w-14 -rotate-12 rounded-xl border" />
        <span className="bg-muted absolute top-3 right-0 h-20 w-14 rotate-12 rounded-xl border" />
        <span className="bg-background absolute top-0 left-1/2 grid h-24 w-[4.25rem] -translate-x-1/2 place-items-center rounded-xl border shadow-sm">
          <Icon className="text-muted-foreground size-6" />
        </span>
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-muted-foreground mt-2 text-sm">{description}</p>}
      {children}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
