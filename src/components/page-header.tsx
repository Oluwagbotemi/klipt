import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-dashed px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {Icon && (
          <span
            aria-hidden
            className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-xl sm:size-12"
          >
            <Icon className="size-5 sm:size-6" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {title}
          </h1>
          {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
